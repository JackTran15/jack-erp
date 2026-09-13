import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileProductService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    service = module.get(MobileProductService);
  });

  const run = (
    sort: MobileProductSort,
    page = 1,
    limit = 20,
    search?: string,
  ) => service.list({ page, limit, sort, search }, actor);

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
    };
    const orphanHeader = {
      type: 'orphan',
      id: 'i-9',
      code: 'BELT-01',
      name: 'Thắt lưng da',
      purchasePrice: 120000,
      sellingPrice: 250000,
      isActive: false,
    };
    const items = [
      {
        id: 'i-1',
        code: 'GELLI-39-NAU',
        variantLabel: '39 · Nâu',
        unit: 'đôi',
        categoryName: 'Giày dép',
        purchasePrice: 350000,
        sellingPrice: 590000,
        weightGram: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
      },
      {
        id: 'i-2',
        code: 'GELLI-40-NAU',
        variantLabel: '40 · Nâu',
        unit: 'đôi',
        categoryName: 'Giày dép',
        purchasePrice: 360000,
        sellingPrice: 600000,
        weightGram: 250,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
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
      });
      // ĐÚNG năm khoá — `unit`/`weightGram` của từng item không được rò vào.
      expect(Object.keys(result.variants[0])).toEqual([
        'id',
        'code',
        'variantLabel',
        'purchasePrice',
        'sellingPrice',
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
        /SELECT type, id, code, name, "purchasePrice", "sellingPrice", "isActive"\s+FROM combined/,
      );
      expect(headerSql()).not.toContain('SELECT * FROM combined');
      expect(itemSql()).not.toContain('SELECT *');
      for (const column of ['description', 'composition', 'barcode', 'brand']) {
        expect(itemSql()).not.toContain(column);
      }
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
});
