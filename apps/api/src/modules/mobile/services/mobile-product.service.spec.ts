import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryItemCrudService } from '../../inventory/location/item-crud.service';
import { MobileProductSort } from '../dto/mobile-product-list.query.dto';
import { MobileProductService } from './mobile-product.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh: phạm vi tổ chức, thứ tự sắp xếp, và những cột KHÔNG được
 * chọn. E2E (`test/e2e/mobile.e2e-spec.ts`) lo phần còn lại — nhưng nó cần
 * database, nên bốn ca ở đây là lưới duy nhất chạy được ở mọi máy.
 */
describe('MobileProductService', () => {
  let service: MobileProductService;
  let query: jest.Mock;
  let repoExist: jest.Mock;
  let itemCrudCreate: jest.Mock;
  let itemCrudUpdate: jest.Mock;
  let itemCrudRemove: jest.Mock;

  const stubRows = [
    { id: 'p-1', code: 'GELLI', name: 'Giày Gelli', sellingPrice: 600000 },
  ];
  const stubCount = [{ total: 7 }];

  beforeEach(async () => {
    // `list` gọi query() hai lần qua Promise.all: dataSql rồi countSql.
    query = jest
      .fn()
      .mockResolvedValueOnce(stubRows)
      .mockResolvedValueOnce(stubCount);

    // Mặc định "mã chưa ai dùng" — `generateItemCode` dừng ở lượt đầu.
    repoExist = jest.fn().mockResolvedValue(false);
    itemCrudCreate = jest.fn();
    itemCrudUpdate = jest.fn();
    itemCrudRemove = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileProductService,
        {
          provide: getDataSourceToken(),
          useValue: { query, getRepository: () => ({ exist: repoExist }) },
        },
        // Đường GHI uỷ quyền trọn cho service này. Stub ở đây vì phần đáng kiểm
        // là payload gửi sang và cách nắn kết quả, không phải logic bên trong
        // nó — cái đó đã có spec riêng.
        {
          provide: InventoryItemCrudService,
          useValue: {
            create: itemCrudCreate,
            update: itemCrudUpdate,
            remove: itemCrudRemove,
          },
        },
      ],
    }).compile();

    service = module.get(MobileProductService);
  });

  const run = (
    sort: MobileProductSort,
    page = 1,
    limit = 20,
    search?: string,
    extra: { categoryId?: string; isActive?: boolean } = {},
  ) => service.list({ page, limit, sort, search, ...extra }, actor);

  /** Câu lệnh lấy dữ liệu là lần gọi ĐẦU; lần thứ hai là đếm. */
  const dataSql = (): string => query.mock.calls[0][0] as string;
  const dataParams = (): unknown[] => query.mock.calls[0][1] as unknown[];
  const countSql = (): string => query.mock.calls[1][0] as string;
  const countParams = (): unknown[] => query.mock.calls[1][1] as unknown[];

  it('phạm vi TỔ CHỨC đi qua tham số $1, không nội suy vào câu lệnh', async () => {
    await run(MobileProductSort.NAME);

    // Ranh giới multi-tenant. Nội suy thẳng orgId vào SQL vẫn "chạy đúng" ở
    // đường bình thường, nên chỉ có test mới giữ được nó ở dạng tham số.
    expect(dataParams()[0]).toBe('org-1');
    expect(dataSql()).toContain('organization_id = $1');
    expect(dataSql()).not.toContain('org-1');
  });

  it('phân trang thành LIMIT/OFFSET đúng thứ tự $2/$3', async () => {
    await run(MobileProductSort.NAME, 3, 5);

    expect(dataParams()).toEqual(['org-1', 5, 10]);
    expect(dataSql()).toContain('LIMIT $2 OFFSET $3');
  });

  it('trả envelope {data,total,page,limit} nguyên vẹn', async () => {
    const result = await run(MobileProductSort.NAME, 2, 5);

    expect(result).toEqual({
      data: stubRows,
      total: 7,
      page: 2,
      limit: 5,
    });
  });

  it('mỗi tiêu chí có ORDER BY riêng, và MỌI tiêu chí kết bằng `id`', async () => {
    const expected: Record<MobileProductSort, string> = {
      [MobileProductSort.NAME]: 'ORDER BY lower(name) ASC, id ASC',
      [MobileProductSort.CODE]: 'ORDER BY lower(code) ASC, id ASC',
      [MobileProductSort.SELLING_PRICE]:
        'ORDER BY "sellingPrice" ASC, lower(name) ASC, id ASC',
    };

    for (const [sort, clause] of Object.entries(expected)) {
      query.mockClear();
      query
        .mockResolvedValueOnce(stubRows)
        .mockResolvedValueOnce(stubCount);

      await run(sort as MobileProductSort);

      expect(dataSql()).toContain(clause);
      // Tie-break `id` là thứ giữ cho LIMIT/OFFSET ổn định giữa các trang. Mất
      // nó thì dòng lặp/sót khi cuộn, và lỗi đó không bao giờ lộ ra ở trang 1.
      expect(dataSql()).toMatch(/ORDER BY[^\n]*id ASC/);
    }
  });

  it('giá trị `sort` lạ KHÔNG lọt vào câu lệnh', async () => {
    // Không đi qua ValidationPipe được ở tầng này, nên đây là bằng chứng rằng
    // ORDER BY dựng từ bảng tra trên enum chứ không từ chuỗi của client.
    await run("name'; DROP TABLE items; --" as MobileProductSort);

    expect(dataSql()).not.toContain('DROP TABLE');
  });

  it('KHÔNG chọn `purchasePrice` hay cột nào ngoài bốn cột app hiển thị', async () => {
    await run(MobileProductSort.NAME);

    // Ca quan trọng nhất của cả bộ: mọi quyết định khác hỏng thì hiện ra trên
    // màn hình, riêng rò giá vốn thì hỏng trong im lặng. `SELECT *` sẽ kéo
    // theo purchasePrice/barcode/isPosVisible vì CTE là của dùng chung.
    //
    // Phép kiểm bám vào câu SELECT NGOÀI CTE — bên TRONG CTE thì
    // `"purchasePrice"` bắt buộc phải có, vì web đọc chung khối đó.
    expect(dataSql()).toMatch(
      /SELECT id, code, name, "sellingPrice"\s+FROM combined/,
    );
    expect(dataSql()).not.toContain('SELECT * FROM combined');
  });
  describe('tìm kiếm', () => {
    it('lọc theo mã HOẶC tên, cả hai bọc COALESCE', async () => {
      await run(MobileProductSort.NAME, 1, 20, 'gelli');

      // OR chứ không AND: một ô gõ duy nhất, khớp cột nào cũng tính.
      expect(dataSql()).toContain(
        `WHERE (COALESCE(code, '') ILIKE $2 OR COALESCE(name, '') ILIKE $2)`,
      );
      expect(dataParams()).toEqual(['org-1', '%gelli%', 20, 0]);
    });

    it('ĐẨY số của LIMIT/OFFSET đi khi có thêm tham số', async () => {
      await run(MobileProductSort.NAME, 3, 5, 'gelli');

      // Đây là ca mà một `$2`/`$3` viết cứng sẽ hỏng: `$2` nay là chuỗi tìm
      // kiếm, nên LIMIT phải nhảy sang `$3`. Lỗi kiểu này KHÔNG ném — nó lặng
      // lẽ lấy `'%gelli%'` làm LIMIT.
      expect(dataSql()).toContain('LIMIT $3 OFFSET $4');
      expect(dataParams()).toEqual(['org-1', '%gelli%', 5, 10]);
    });

    it('câu ĐẾM dùng CÙNG mệnh đề WHERE nhưng KHÔNG có LIMIT/OFFSET', async () => {
      await run(MobileProductSort.NAME, 1, 20, 'gelli');

      // Lệch một chữ giữa hai câu là `total` không khớp `data`, và cuộn vô tận
      // đòi thêm trang cho những dòng không tồn tại.
      expect(countSql()).toContain(
        `WHERE (COALESCE(code, '') ILIKE $2 OR COALESCE(name, '') ILIKE $2)`,
      );
      expect(countSql()).not.toContain('LIMIT');
      expect(countParams()).toEqual(['org-1', '%gelli%']);
    });

    it('escape `%` và `_` — người dùng gõ chúng là ký tự, không phải ký tự đại diện', async () => {
      await run(MobileProductSort.NAME, 1, 20, '50%_off');

      expect(dataParams()[1]).toBe('%50\\%\\_off%');
    });

    it('rỗng hoặc toàn khoảng trắng thì KHÔNG có WHERE nào', async () => {
      await run(MobileProductSort.NAME, 1, 20, '   ');

      // KHÔNG so `not.toContain('WHERE')`: chính `COMBINED_CTE` đã mang
      // `WHERE i.organization_id = $1` bên trong, nên phép so đó không bao giờ
      // đúng. Thứ phải vắng là mệnh đề tìm kiếm.
      expect(dataSql()).not.toContain('ILIKE');
      expect(dataSql()).toContain('LIMIT $2 OFFSET $3');
      expect(dataParams()).toEqual(['org-1', 20, 0]);
    });
  });

  describe('bộ lọc', () => {
    const categoryId = 'c0000000-0000-4000-8000-000000000001';

    it('nhóm hàng lọc bằng EXISTS ngoài CTE, phủ cả mẫu mã lẫn item lẻ', async () => {
      await run(MobileProductSort.NAME, 1, 20, undefined, { categoryId });

      // `EXISTS` chứ không thêm cột vào `buildCombinedCte`: CTE đó dùng chung
      // với `SearchInventoryItemsV2Handler` của web và tự cảnh báo rằng sửa nó
      // sẽ làm hỏng phía kia mà không có gì báo.
      expect(dataSql()).toContain('EXISTS (');
      expect(dataSql()).toContain('FROM items f');
      expect(dataSql()).toContain('f.category_id = $2');
      // Hai vế phủ hai nhánh của `combined` mà không cần đọc cột `type`.
      expect(dataSql()).toContain(
        'f.product_id = combined.id OR f.id = combined.id',
      );
      // Ranh giới multi-tenant lặp lại ở chính subquery.
      expect(dataSql()).toContain('f.organization_id = $1');
      expect(dataParams()).toEqual(['org-1', categoryId, 20, 0]);
    });

    it('trạng thái lọc thẳng trên cột của CTE, không cần EXISTS', async () => {
      await run(MobileProductSort.NAME, 1, 20, undefined, { isActive: false });

      expect(dataSql()).toContain('"isActive" = $2');
      expect(dataSql()).not.toContain('EXISTS (');
      expect(dataParams()).toEqual(['org-1', false, 20, 0]);
    });

    it('KHÔNG lọc trạng thái khi `isActive` vắng — mặc định hiện cả hàng đã ngừng', async () => {
      await run(MobileProductSort.NAME);

      // Màn quản lý danh mục: một mặt hàng biến mất khỏi danh sách thì người
      // dùng không còn đường nào tìm lại nó.
      expect(dataSql()).not.toContain('"isActive" =');
    });

    it('ba bộ lọc nối bằng AND, và LIMIT/OFFSET nhảy đúng số', async () => {
      await run(MobileProductSort.NAME, 2, 10, 'gelli', {
        categoryId,
        isActive: true,
      });

      // Nối bằng AND chứ không gán đè: gán đè là cách chắc chắn có ngày một bộ
      // lọc nuốt mất bộ lọc trước nó.
      expect(dataSql()).toMatch(/ILIKE \$2[\s\S]*AND EXISTS/);
      expect(dataSql()).toContain('"isActive" = $4');
      expect(dataSql()).toContain('LIMIT $5 OFFSET $6');
      expect(dataParams()).toEqual([
        'org-1',
        '%gelli%',
        categoryId,
        true,
        10,
        10,
      ]);
    });

    it('câu ĐẾM mang y hệt mệnh đề lọc, không kèm LIMIT', async () => {
      await run(MobileProductSort.NAME, 1, 20, undefined, {
        categoryId,
        isActive: true,
      });

      // Lệch một chữ giữa hai câu là `total` không khớp `data`, và cuộn vô tận
      // đòi thêm trang cho những dòng không tồn tại.
      expect(countSql()).toContain('f.category_id = $2');
      expect(countSql()).toContain('"isActive" = $3');
      expect(countSql()).not.toContain('LIMIT');
      expect(countParams()).toEqual(['org-1', categoryId, true]);
    });
  });

  describe('findById', () => {
    const productId = 'a0000000-0000-4000-8000-000000000001';

    // Giá của header CỐ Ý khác giá của item[0]: phát hiện ngay nếu code lấy
    // nhầm nguồn (giá màn chi tiết phải là giá TRUNG BÌNH của CTE, khớp danh
    // sách, không phải giá của item đại diện).
    const productHeader = {
      type: 'product',
      id: productId,
      code: 'GELLI',
      name: 'Giày Gelli',
      purchasePrice: 355000,
      sellingPrice: 595000,
      isActive: true,
      isPosVisible: true,
    };
    const orphanHeader = {
      type: 'orphan',
      id: 'i-9',
      code: 'BELT-01',
      name: 'Thắt lưng da',
      purchasePrice: 120000,
      sellingPrice: 250000,
      isActive: false,
      isPosVisible: false,
    };
    const items = [
      {
        id: 'i-1',
        code: 'GELLI-39-NAU',
        variantLabel: '39 · Nâu',
        unit: 'đôi',
        categoryId: 'cat-1',
        categoryName: 'Giày dép',
        purchasePrice: 350000,
        sellingPrice: 590000,
        weightGram: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        barcode: '8938000000001',
        description: 'Da bò thật',
        color: 'Nâu',
        size: '39',
      },
      {
        id: 'i-2',
        code: 'GELLI-40-NAU',
        variantLabel: '40 · Nâu',
        unit: 'đôi',
        categoryId: 'cat-1',
        categoryName: 'Giày dép',
        purchasePrice: 360000,
        sellingPrice: 600000,
        weightGram: 250,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
        barcode: '8938000000002',
        description: 'Da bò thật',
        color: 'Nâu',
        size: '40',
      },
    ];

    /** Câu ĐẦU tra header trên CTE; câu THỨ HAI lấy item/biến thể. */
    const headerSql = (): string => query.mock.calls[0][0] as string;
    const headerParams = (): unknown[] => query.mock.calls[0][1] as unknown[];
    const itemSql = (): string => query.mock.calls[1][0] as string;
    const itemParams = (): unknown[] => query.mock.calls[1][1] as unknown[];

    beforeEach(() => {
      // `beforeEach` ngoài đã xếp sẵn hai stub cho `list`; ở đây tự cấp.
      query.mockReset();
    });

    it('phạm vi TỔ CHỨC đi qua `$1` ở CẢ HAI câu, không nội suy', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      await service.findById(productId, actor);

      expect(headerParams()[0]).toBe('org-1');
      expect(itemParams()[0]).toBe('org-1');
      expect(headerSql()).toContain('organization_id = $1');
      // Câu hai KHÔNG được dựa vào việc câu một đã lọc — ranh giới
      // multi-tenant phải đứng ở từng câu.
      expect(itemSql()).toContain('i.organization_id = $1');
      expect(headerSql()).not.toContain('org-1');
      expect(itemSql()).not.toContain('org-1');
    });

    it('tra header bằng `WHERE id = $2` trên CTE dùng chung với danh sách', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      await service.findById(productId, actor);

      expect(headerSql()).toContain('FROM combined');
      expect(headerSql()).toContain('WHERE id = $2');
      expect(headerParams()).toEqual(['org-1', productId]);
    });

    it('không có dòng nào -> 404, và KHÔNG chạy câu thứ hai', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.findById(productId, actor)).rejects.toThrow(
        NotFoundException,
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('mẫu mã: header từ CTE, mô tả từ item đại diện, mọi item thành `variants`', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      const result = await service.findById(productId, actor);

      // Nhóm header — phải là con số của CTE (khớp danh sách).
      expect(result).toMatchObject({
        id: productId,
        code: 'GELLI',
        name: 'Giày Gelli',
        isActive: true,
        purchasePrice: 355000,
        sellingPrice: 595000,
      });
      // Nhóm mô tả — lấy ở item ĐẦU TIÊN (mã nhỏ nhất), không phải item nào khác.
      expect(result).toMatchObject({
        categoryName: 'Giày dép',
        unit: 'đôi',
        weightGram: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
      });
      expect(result.variants).toHaveLength(2);
      expect(result.variants[1]).toEqual({
        id: 'i-2',
        code: 'GELLI-40-NAU',
        variantLabel: '40 · Nâu',
        purchasePrice: 360000,
        sellingPrice: 600000,
        color: 'Nâu',
        size: '40',
      });
      // Tập khoá ĐÓNG — `unit`/`weightGram`/`description` của từng item không
      // được rò vào mảng biến thể. `color`/`size` có mặt là NGOẠI LỆ đã khai ở
      // `MobileProductVariantDto`: chúng phục vụ màn Sửa dựng lại chip.
      expect(Object.keys(result.variants[0])).toEqual([
        'id',
        'code',
        'variantLabel',
        'purchasePrice',
        'sellingPrice',
        'color',
        'size',
      ]);

      expect(itemSql()).toContain('i.product_id = $2');
      expect(itemSql()).toContain('ORDER BY i.code ASC, i.id ASC');
      expect(itemParams()).toEqual(['org-1', productId]);
    });

    it('item lẻ: tra chính nó, `variants` rỗng', async () => {
      query
        .mockResolvedValueOnce([orphanHeader])
        .mockResolvedValueOnce([items[0]]);

      const result = await service.findById('i-9', actor);

      expect(result.variants).toEqual([]);
      expect(result.isActive).toBe(false);
      expect(result.code).toBe('BELT-01');
      expect(itemSql()).toContain('i.id = $2');
      expect(itemSql()).not.toContain('product_id');
    });

    it('bản ghi biến mất giữa hai câu -> vẫn 404, không TypeError', async () => {
      query.mockResolvedValueOnce([productHeader]).mockResolvedValueOnce([]);

      await expect(service.findById(productId, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('KHÔNG `SELECT *`, và không kéo cột ngoài những gì màn hình vẽ', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      await service.findById(productId, actor);

      expect(headerSql()).toMatch(
        /SELECT type, id, code, name, "purchasePrice", "sellingPrice",\s+"isActive", "isPosVisible"\s+FROM combined/,
      );
      expect(headerSql()).not.toContain('SELECT * FROM combined');
      expect(itemSql()).not.toContain('SELECT *');

      // `description` và `barcode` nay CÓ mặt một cách có chủ ý — màn Sửa cần
      // chúng để nạp lại ô đã nhập. Thứ vẫn phải vắng là các cột không màn nào
      // của app vẽ ra.
      for (const column of ['composition', 'brand', 'manufacture_year']) {
        expect(itemSql()).not.toContain(column);
      }
    });

    it('lấy đủ trường mà màn SỬA cần nạp lại, từ item đại diện', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      const result = await service.findById(productId, actor);

      // Thiếu bất kỳ trường nào dưới đây là Sửa-rồi-Lưu làm MẤT dữ liệu đang
      // có: ô hiện ra trống, người dùng bấm Lưu, giá trị cũ bị ghi đè.
      expect(result).toMatchObject({
        categoryId: 'cat-1',
        barcode: '8938000000001',
        description: 'Da bò thật',
        isPosVisible: true,
      });
    });

    it('color/size dò theo LOWER(def.name), cùng cách ItemCrudService tạo ra chúng', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      await service.findById(productId, actor);

      // Hai chỗ phải khớp: chính `ItemCrudService` tạo định nghĩa với tên
      // `"Color"`/`"Size"` và dò lại bằng `LOWER(...)`. Lệch là chip Màu sắc /
      // Size không bao giờ nạp lại được ở chế độ Sửa.
      expect(itemSql()).toContain("LOWER(d.name) = 'color'");
      expect(itemSql()).toContain("LOWER(d.name) = 'size'");
      // Subquery chứ KHÔNG join: join nhân đôi dòng item và `items[0]` thôi là
      // item đại diện.
      expect(itemSql()).not.toContain('JOIN item_attribute_values');
    });

    it('MỌI cột decimal ép `::float` — driver pg trả numeric thành chuỗi', async () => {
      query
        .mockResolvedValueOnce([productHeader])
        .mockResolvedValueOnce(items);

      await service.findById(productId, actor);

      for (const column of [
        'purchase_price',
        'selling_price',
        'weight_gram',
        'length_cm',
        'width_cm',
        'height_cm',
      ]) {
        expect(itemSql()).toContain(`${column}::float`);
      }
    });
  });

  describe('create', () => {
    const productId = 'a0000000-0000-4000-8000-000000000001';

    const header = {
      type: 'product',
      id: productId,
      code: 'GELLI',
      name: 'Giày Gelli',
      purchasePrice: 0,
      sellingPrice: 0,
      isActive: true,
      isPosVisible: true,
    };
    const item = {
      id: 'i-1',
      code: 'GELLI',
      variantLabel: null,
      unit: 'đôi',
      categoryId: null,
      categoryName: null,
      purchasePrice: 0,
      sellingPrice: 0,
      weightGram: null,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      barcode: null,
      description: null,
      color: null,
      size: null,
    };

    /** Xếp sẵn hai lượt query mà `findById` sẽ gọi sau khi ghi. */
    const stubReadBack = () => {
      query.mockReset();
      query.mockResolvedValueOnce([header]).mockResolvedValueOnce([item]);
    };

    it('nhánh ma trận biến thể: đọc lại theo `productId` mà service kia trả', async () => {
      itemCrudCreate.mockResolvedValue({ productId, itemsCreated: 4 });
      stubReadBack();

      const result = await service.create(
        { name: 'Giày Gelli', code: 'GELLI', unit: 'đôi', colors: ['Nâu'] },
        actor,
      );

      // `{productId, itemsCreated}` KHÔNG phải một bản ghi — chuẩn hoá bằng
      // cách đọc lại là thứ giữ cho response luôn gương đúng `GET :id`.
      expect(query.mock.calls[0][1]).toEqual(['org-1', productId]);
      expect(result.id).toBe(productId);
    });

    it('nhánh item lẻ: đọc lại theo `id` của ItemEntity', async () => {
      itemCrudCreate.mockResolvedValue({ id: 'i-1', code: 'GELLI' });
      query.mockReset();
      query
        .mockResolvedValueOnce([{ ...header, type: 'orphan', id: 'i-1' }])
        .mockResolvedValueOnce([item]);

      const result = await service.create(
        { name: 'Giày Gelli', code: 'GELLI', unit: 'đôi' },
        actor,
      );

      expect(result.id).toBe('i-1');
    });

    it('kết quả không có id nào -> ném lỗi có tên, không thành 404 gây hiểu nhầm', async () => {
      itemCrudCreate.mockResolvedValue({ itemsCreated: 0 });

      await expect(
        service.create({ name: 'X', unit: 'cái' }, actor),
      ).rejects.toThrow(/hợp đồng đã đổi/);
    });

    it('`barcode` MỘT chuỗi -> `barcodes: [{code}]`, tên mà saveBarcodes đọc', async () => {
      itemCrudCreate.mockResolvedValue({ id: 'i-1' });
      stubReadBack();

      await service.create(
        { name: 'Giày', code: 'GIAY', unit: 'đôi', barcode: '893800' },
        actor,
      );

      const payload = itemCrudCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.barcodes).toEqual([{ code: '893800' }]);
      // Khoá số ít phải BIẾN MẤT: `items` không có cột `barcode`, gửi kèm là
      // một khoá thừa đi thẳng vào `manager.create`.
      expect(payload).not.toHaveProperty('barcode');
    });

    it('`barcode` vắng -> KHÔNG có khoá `barcodes` (giữ nguyên, không xoá)', async () => {
      itemCrudCreate.mockResolvedValue({ id: 'i-1' });
      stubReadBack();

      await service.create({ name: 'Giày', code: 'GIAY', unit: 'đôi' }, actor);

      expect(itemCrudCreate.mock.calls[0][0]).not.toHaveProperty('barcodes');
    });

    it('`code` trống -> sinh từ tên: bỏ dấu, đ->d, viết hoa, chỉ A-Z0-9', async () => {
      itemCrudCreate.mockResolvedValue({ id: 'i-1' });
      stubReadBack();

      await service.create({ name: 'Giày Đá Bóng 39', unit: 'đôi' }, actor);

      expect(
        (itemCrudCreate.mock.calls[0][0] as Record<string, unknown>).code,
      ).toBe('GIAYDABONG39');
    });

    it('`code` sinh ra bị trùng -> thêm hậu tố, không để thành 409', async () => {
      // Form của app ghi "để trống thì máy tự sinh mã"; người dùng không gõ mã
      // nào thì cũng không có ô nào để tự gỡ va chạm.
      repoExist.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      itemCrudCreate.mockResolvedValue({ id: 'i-1' });
      stubReadBack();

      await service.create({ name: 'Giày', unit: 'đôi' }, actor);

      expect(
        (itemCrudCreate.mock.calls[0][0] as Record<string, unknown>).code,
      ).toBe('GIAY-2');
    });

    it('tên không còn ký tự nào hợp lệ -> lùi về tiền tố mặc định', async () => {
      itemCrudCreate.mockResolvedValue({ id: 'i-1' });
      stubReadBack();

      await service.create({ name: '!!! ???', unit: 'cái' }, actor);

      expect(
        (itemCrudCreate.mock.calls[0][0] as Record<string, unknown>).code,
      ).toBe('SP');
    });

    it('`code` do người dùng gõ thì KHÔNG đụng tới, và không dò trùng', async () => {
      itemCrudCreate.mockResolvedValue({ id: 'i-1' });
      stubReadBack();

      await service.create(
        { name: 'Giày Gelli', code: 'my-sku', unit: 'đôi' },
        actor,
      );

      expect(
        (itemCrudCreate.mock.calls[0][0] as Record<string, unknown>).code,
      ).toBe('my-sku');
      expect(repoExist).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const id = 'a0000000-0000-4000-8000-000000000001';

    const header = {
      type: 'orphan',
      id,
      code: 'GELLI',
      name: 'Giày Gelli',
      purchasePrice: 0,
      sellingPrice: 0,
      isActive: true,
      isPosVisible: true,
    };
    const item = {
      id,
      code: 'GELLI',
      variantLabel: null,
      unit: 'đôi',
      categoryId: null,
      categoryName: null,
      purchasePrice: 0,
      sellingPrice: 0,
      weightGram: null,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      barcode: null,
      description: null,
      color: null,
      size: null,
    };

    it('bản ghi không tồn tại -> 404 TRƯỚC khi ghi bất cứ thứ gì', async () => {
      query.mockReset();
      query.mockResolvedValueOnce([]);

      await expect(service.update(id, { name: 'X' }, actor)).rejects.toThrow(
        NotFoundException,
      );
      expect(itemCrudUpdate).not.toHaveBeenCalled();
    });

    it('`code` trống KHÔNG sinh mã mới — bỏ trống nghĩa là giữ nguyên', async () => {
      query.mockReset();
      query
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce([item])
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce([item]);

      await service.update(id, { name: 'Giày Gelli' }, actor);

      // Sinh mã ở đây sẽ âm thầm đổi SKU của một mặt hàng đang lưu hành.
      expect(
        (itemCrudUpdate.mock.calls[0][1] as Record<string, unknown>),
      ).not.toHaveProperty('code');
      expect(repoExist).not.toHaveBeenCalled();
    });

    it('đọc lại theo CHÍNH `id` đã nhận, không theo kết quả của service kia', async () => {
      query.mockReset();
      query
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce([item])
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce([item]);
      itemCrudUpdate.mockResolvedValue({ id: 'khac-han' });

      const result = await service.update(id, { name: 'Giày' }, actor);

      expect(itemCrudUpdate).toHaveBeenCalledWith(
        id,
        expect.any(Object),
        actor,
      );
      expect(result.id).toBe(id);
    });
  });

  /**
   * Lượt XOÁ là một UỶ QUYỀN TRẦN — cùng service method mà web gọi qua
   * `/admin/entities/inventory-items/records/:id`. Hai ca dưới đây khoá đúng
   * tính chất đó, vì nó là YÊU CẦU chứ không phải chi tiết cài đặt: web và
   * mobile phải hành xử giống hệt nhau, kể cả khi đường xoá đang hỏng.
   */
  describe('remove', () => {
    const id = '3f2f1c4e-0000-4000-8000-000000000001';

    it('chuyển thẳng id và actor cho InventoryItemCrudService', async () => {
      await service.remove(id, actor);

      expect(itemCrudRemove).toHaveBeenCalledWith(id, actor);
      expect(itemCrudRemove).toHaveBeenCalledTimes(1);
    });

    it('KHÔNG tự chạy SQL nào — không đọc phủ đầu, không xoá tay', async () => {
      query.mockReset();

      await service.remove(id, actor);

      // Thêm một lượt `findById` ở đây là mobile ném 404 tiếng Việt trong khi
      // web ném `Record ... not found` — tức lệch. Xem doc của `remove`.
      expect(query).not.toHaveBeenCalled();
    });

    it('để lỗi của service kia đi nguyên lên, không bọc lại', async () => {
      const boom = new Error('Cannot remove, given value must be instance of entity class');
      itemCrudRemove.mockRejectedValue(boom);

      await expect(service.remove(id, actor)).rejects.toBe(boom);
    });
  });
});
