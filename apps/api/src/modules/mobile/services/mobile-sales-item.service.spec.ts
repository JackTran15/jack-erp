import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { MobileSalesItemViewBy } from '../dto/mobile-sales-item-list.query.dto';
import { PosCatalogProductService } from '../../pos/services/pos-catalog-product.service';
import { MobileSalesItemService } from './mobile-sales-item.service';

const actor: ActorContext = {
  userId: 'sales-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

/** Một item như repository trả về — CỐ Ý mang cả field không được rò. */
function item(overrides: Partial<ItemEntity> = {}): ItemEntity {
  return {
    id: 'i-1',
    code: 'GELLI-39-NAU',
    name: 'Giày Gelli (39 · Nâu)',
    variantLabel: '39 · Nâu',
    unit: 'đôi',
    purchasePrice: '350000.00',
    sellingPrice: '590000.00',
    weightGram: 800,
    manufactureYear: 2026,
    composition: 'Da thật',
    organizationId: 'org-1',
    isActive: true,
    isPosVisible: true,
    ...overrides,
  } as unknown as ItemEntity;
}

describe('MobileSalesItemService', () => {
  let service: MobileSalesItemService;
  let qb: Record<string, jest.Mock>;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[item()], 1]),
    };

    dataSource = { query: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileSalesItemService,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { createQueryBuilder: () => qb },
        },
        { provide: getDataSourceToken(), useValue: dataSource },
        // Chỉ để dựng được service. Mọi test trong file này nói về `list`/`getModel` —
        // hai đường không chạm tới nó. Phần `getModelStock` uỷ quyền trọn cho service
        // thật, nên chỗ kiểm nó là spec của `PosCatalogProductService`.
        { provide: PosCatalogProductService, useValue: { getProductDetail: jest.fn() } },
      ],
    }).compile();

    service = module.get(MobileSalesItemService);
  });

  const run = (
    query: {
      page?: number;
      limit?: number;
      search?: string;
      viewBy?: MobileSalesItemViewBy;
      inStockOnly?: boolean;
      categoryId?: string;
    } = {},
    as: ActorContext = actor,
  ) => service.list({ page: 1, limit: 20, ...query }, as);

  /**
   * Mức BIẾN THỂ nay phải hỏi tường minh — mặc định là mẫu mã.
   *
   * Bọc thành helper thay vì rải `viewBy: ITEM` khắp nơi: nếu mặc định đổi lần
   * nữa thì chỉ một dòng này phải sửa, và tên helper nói ra rằng cả nhóm test
   * dưới đây nói về đúng một mức.
   */
  const runItems = (
    query: { page?: number; limit?: number; search?: string; inStockOnly?: boolean; categoryId?: string } = {},
    as: ActorContext = actor,
  ) => run({ ...query, viewBy: MobileSalesItemViewBy.ITEM }, as);

  /** Mọi mệnh đề `andWhere` đã gửi, gộp thành một chuỗi để tra nhanh. */
  const conditions = () => qb.andWhere.mock.calls.map((c) => c[0]).join(' | ');

  /** Câu SQL thô đã gửi ở lượt gọi thứ [n] (0-based). */
  const sql = (n = 0) => String(dataSource.query.mock.calls[n][0]);

  describe('viewBy=item (phải hỏi tường minh)', () => {
    it('trả ĐÚNG tám trường — có giá BÁN, không rò giá VỐN', async () => {
      const { data } = await runItems();

      expect(Object.keys(data[0]).sort()).toEqual([
        'code',
        'id',
        'name',
        'sellingPrice',
        'type',
        'unit',
        'variantCount',
        'variantLabel',
      ]);

      // Chiều loại trừ NGƯỢC với `MobileItemService`, và đó là toàn bộ lý do hai
      // service tồn tại song song: bên kia phục vụ người lập phiếu KHO nên trả
      // giá nhập và giấu giá bán; bên này phục vụ người BÁN nên ngược lại. Giá
      // vốn không phải thứ nhân viên bán hàng cần thấy.
      const serialized = JSON.stringify(data[0]);
      for (const leak of [
        'purchasePrice',
        'weightGram',
        'composition',
        'manufactureYear',
      ]) {
        expect(serialized).not.toContain(leak);
      }
    });

    it('`type` là `item` và `variantCount` là 1 — dòng bán được ngay', async () => {
      // Client đọc `type` để quyết định chạm vào thì mở bảng chọn biến thể hay
      // bỏ thẳng vào giỏ. Ở mức này `id` LÀ `items.id`, nên câu trả lời là
      // "bỏ thẳng vào giỏ" — và hai trường này là chỗ duy nhất nói ra điều đó.
      const { data } = await runItems();

      expect(data[0].type).toBe('item');
      expect(data[0].variantCount).toBe(1);
    });

    it('`sellingPrice` về đúng KIỂU SỐ, không phải chuỗi của Postgres', async () => {
      const { data } = await runItems();

      // Cột `decimal` về Node dưới dạng chuỗi; để nguyên thì app nhận
      // "590000.00" và mọi phép cộng thành nối chuỗi.
      expect(typeof data[0].sellingPrice).toBe('number');
      expect(data[0].sellingPrice).toBe(590000);
    });

    it('giá 0 vẫn trả 0, KHÔNG bị nuốt thành null', async () => {
      // `Number('0.00') || 0` cho `0` — đúng. Nhưng ai đó đổi sang `?? 0` rồi
      // `??` gặp chuỗi rỗng sẽ ra `''`. Hàng chưa đặt giá là ca HỢP LỆ và màn
      // bán hàng phải bày đúng số 0, không ẩn đi.
      qb.getManyAndCount.mockResolvedValue([
        [item({ sellingPrice: '0.00' } as never)],
        1,
      ]);

      const { data } = await runItems();

      expect(data[0].sellingPrice).toBe(0);
    });

    it('LOẠI hàng đã ngừng kinh doanh', async () => {
      await runItems();

      expect(conditions()).toContain('item.isActive = true');
    });

    it('LOẠI hàng không bày ở quầy — khác `MobileItemService`', async () => {
      // Hàng có thể còn kinh doanh mà cố ý không bán tại quầy: vật tư đóng gói,
      // hàng nội bộ. Phiếu kho vẫn cần chúng, màn bán hàng thì không.
      await runItems();

      expect(conditions()).toContain('item.isPosVisible = true');
    });

    it('tìm theo mã, tên VÀ nhãn biến thể', async () => {
      await runItems({ search: 'GELLI' });

      const where = conditions();
      expect(where).toContain('item.code ILIKE');
      expect(where).toContain('item.name ILIKE');
      expect(where).toContain('item.variantLabel ILIKE');
    });

    it('search rỗng KHÔNG sinh mệnh đề ILIKE', async () => {
      await runItems({ search: '   ' });

      expect(conditions()).not.toContain('ILIKE');
    });

    it('sắp xếp có khoá phụ `id` để phân trang ổn định', async () => {
      // `name` trùng nhau rất nhiều (sáu biến thể một mẫu mã chỉ khác nhãn), và
      // LIMIT/OFFSET trên thứ tự không duy nhất thì Postgres được phép trả khác
      // nhau giữa hai lượt — biểu hiện ra là cuộn tới trang 2 thấy lặp dòng của
      // trang 1.
      await runItems();

      expect(qb.orderBy).toHaveBeenCalledWith('lower(item.name)', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('item.id', 'ASC');
    });

    it('phân trang tính đúng offset', async () => {
      await runItems({ page: 3, limit: 20 });

      expect(qb.skip).toHaveBeenCalledWith(40);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('`variantLabel` vắng cho ra NULL, không phải chuỗi rỗng', async () => {
      qb.getManyAndCount.mockResolvedValue([
        [item({ variantLabel: undefined })],
        1,
      ]);

      const { data } = await runItems();

      expect(data[0].variantLabel).toBeNull();
    });
  });

  describe('inStockOnly', () => {
    it('KHÔNG sinh subquery tồn kho khi tắt — lượt nạp thường không trả tiền cho nó', async () => {
      await runItems();

      expect(conditions()).not.toContain('stock_balances');
    });

    it('lọc tổng tồn > 0, cùng bộ điều kiện với bộ lọc "hết hàng" của web', async () => {
      await runItems({ inStockOnly: true });

      const where = conditions();
      // Ngưỡng `> 0` là PHẦN BÙ CHẶT của `<= 0` bên
      // `SearchInventoryItemsV2Handler`. Lệch một điều kiện là cùng một mặt
      // hàng lọt cả hai bộ lọc đối nhau, và không có gì báo.
      expect(where).toContain('SUM(sb.quantity)');
      expect(where).toContain('> 0');
      expect(where).toContain('sb.is_tracked = true');
      expect(where).toContain('loc.is_active = true');
      expect(where).toContain('st.is_active = true');
      expect(where).toContain('sb.branch_id = :branch');
    });

    it('TỪ CHỐI khi chưa chọn chi nhánh, thay vì trả cả danh mục là "hết hàng"', async () => {
      // Không có chi nhánh thì mọi tổng bằng 0 và cả danh mục đọc ra là hết
      // hàng — một câu trả lời sai mà trông như đúng. Cùng lập luận, cùng cách
      // xử lý với handler của web.
      await expect(
        run({ inStockOnly: true }, { ...actor, branchId: undefined as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('mặc định', () => {
    it('KHÔNG truyền `viewBy` thì đi nhánh MẪU MÃ, không phải biến thể', async () => {
      // Đây là mặc định Loc chốt: người bán tìm hàng theo mẫu mã, một dòng
      // "Giày Gelli" thay vì mười bốn dòng chỉ khác đuôi mã. Test này là chỗ
      // duy nhất khoá chiều mặc định — đảo nó lại thì mọi test khác vẫn xanh
      // vì chúng đều nói rõ mức mình muốn.
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      await run();

      expect(dataSource.query).toHaveBeenCalled();
      expect(String(dataSource.query.mock.calls[0][0])).toContain('WITH model AS');
      // Và KHÔNG chạm QueryBuilder — nhánh biến thể không chạy.
      expect(qb.getManyAndCount).not.toHaveBeenCalled();
    });
  });

  describe('viewBy=model', () => {
    beforeEach(() => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            type: 'model',
            id: 'p-1',
            code: 'GELLI',
            name: 'Giày Gelli',
            variantLabel: null,
            unit: 'đôi',
            sellingPrice: 590000,
            variantCount: 6,
          },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);
    });

    it('gộp theo mẫu mã và nói ra số biến thể', async () => {
      const { data, total } = await run({
        viewBy: MobileSalesItemViewBy.MODEL,
      });

      expect(data[0].type).toBe('model');
      expect(data[0].id).toBe('p-1');
      expect(data[0].variantCount).toBe(6);
      expect(total).toBe(1);
    });

    it('điều kiện bán được nằm ở JOIN, nên MỘT biến thể ngừng bán không giấu cả mẫu mã', async () => {
      await run({ viewBy: MobileSalesItemViewBy.MODEL });

      // Đây là khác biệt NGHĨA với `COMBINED_CTE` của web (`bool_and`), và là
      // lý do service này không dùng lại CTE đó. Kiểm trên chuỗi SQL vì đây là
      // truy vấn thô — test E2E mới nói được kết quả đúng hay sai.
      const generated = sql();
      expect(generated).not.toContain('bool_and');
      expect(generated).toContain('INNER JOIN items i');
      expect(generated).toMatch(/ON i\.product_id = p\.id[\s\S]*i\.is_active = true/);
    });

    it('hàng lẻ (không thuộc mẫu mã nào) trả `type: item` — bỏ thẳng vào giỏ được', async () => {
      dataSource.query.mockReset();
      dataSource.query
        .mockResolvedValueOnce([
          {
            type: 'item',
            id: 'i-9',
            code: 'TUI-01',
            name: 'Túi đựng',
            variantLabel: null,
            unit: 'cái',
            sellingPrice: 15000,
            variantCount: 1,
          },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);

      const { data } = await run({ viewBy: MobileSalesItemViewBy.MODEL });

      // `id` của nó LÀ `items.id`, nên mở bảng chọn biến thể ở đây là bắt người
      // dùng chọn giữa đúng một lựa chọn.
      expect(data[0].type).toBe('item');
      expect(data[0].variantCount).toBe(1);
    });

    it('KHÔNG sinh subquery tồn kho khi tắt bộ lọc còn hàng', async () => {
      await run({ viewBy: MobileSalesItemViewBy.MODEL });

      expect(sql()).not.toContain('stock_balances');
    });

    it('câu ĐẾM không nhận tham số LIMIT/OFFSET', async () => {
      // Thừa hai tham số là Postgres ném "bind message supplies N parameters" —
      // và nó chỉ ném ở runtime, trên đúng lượt gọi có phân trang.
      await run({ viewBy: MobileSalesItemViewBy.MODEL, page: 2, limit: 20 });

      const dataParams = dataSource.query.mock.calls[0][1] as unknown[];
      const countParams = dataSource.query.mock.calls[1][1] as unknown[];

      expect(dataParams.slice(-2)).toEqual([20, 20]);
      expect(countParams).toEqual(['org-1']);
    });
  });

  describe('getModel', () => {
    it('404 khi mẫu mã thuộc tổ chức khác — không phải một mẫu mã rỗng', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await expect(service.getModel('p-1', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Dừng ngay ở truy vấn đầu: không chạy hai truy vấn sau.
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });

    it('gom các chiều theo THỨ TỰ CẤU HÌNH, không theo bảng chữ cái', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'p-1', code: 'GELLI', name: 'Giày Gelli' }])
        .mockResolvedValueOnce([
          {
            id: 'i-1',
            code: 'GELLI-D-39',
            name: 'Giày Gelli',
            variantLabel: 'D · 39',
            unit: 'đôi',
            sellingPrice: 590000,
          },
          // `i-2` phải CÓ ở đây: danh sách chiều nay chỉ gom nhãn của biến thể
          // bán được. Test này nói về THỨ TỰ, không về lọc — để `i-2` ngoài
          // danh sách là đổi chủ đề của nó thành một phép lọc.
          {
            id: 'i-2',
            code: 'GELLI-D-40',
            name: 'Giày Gelli',
            variantLabel: 'D · 40',
            unit: 'đôi',
            sellingPrice: 590000,
          },
        ])
        // Đã sắp sẵn bằng `ORDER BY` của câu lệnh: Size trước, và `S, M, L`
        // đúng thứ tự mặc — sắp lại bằng `sort()` ở tầng TS sẽ hỏng đúng ca này.
        .mockResolvedValueOnce([
          {
            itemId: 'i-1',
            attributeName: 'Size',
            attributeSort: 0,
            valueLabel: 'S',
            valueSort: 0,
          },
          {
            itemId: 'i-2',
            attributeName: 'Size',
            attributeSort: 0,
            valueLabel: 'M',
            valueSort: 1,
          },
          {
            itemId: 'i-1',
            attributeName: 'Màu sắc',
            attributeSort: 1,
            valueLabel: 'D',
            valueSort: 0,
          },
        ]);

      const model = await service.getModel('p-1', actor);

      expect(model.attributes.map((a) => a.name)).toEqual(['Size', 'Màu sắc']);
      expect(model.attributes[0].options).toEqual(['S', 'M']);
    });

    it('mã vạch gom theo BIẾN THỂ, và biến thể chưa có mã thì là mảng RỖNG', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'p-1', code: 'GELLI', name: 'Giày Gelli' }])
        .mockResolvedValueOnce([
          {
            id: 'i-1',
            code: 'GELLI-D-39',
            name: 'Giày Gelli',
            variantLabel: 'D · 39',
            unit: 'đôi',
            sellingPrice: 590000,
          },
          {
            id: 'i-2',
            code: 'GELLI-D-40',
            name: 'Giày Gelli',
            variantLabel: 'D · 40',
            unit: 'đôi',
            sellingPrice: 590000,
          },
        ])
        .mockResolvedValueOnce([])
        // `i-1` mang HAI mã (EAN nhà sản xuất + mã nội bộ) còn `i-2` không mang
        // mã nào — hai ca thật của `item_barcodes`, vốn là quan hệ một-nhiều
        // KHÔNG có cờ `isPrimary`. Cho mỗi biến thể đúng một mã thì test xanh
        // cả khi phép gom lấy nhầm mã của biến thể bên cạnh.
        .mockResolvedValueOnce([
          { itemId: 'i-1', code: '8935001234567' },
          { itemId: 'i-1', code: 'NB-0042' },
        ]);

      const model = await service.getModel('p-1', actor);

      expect(model.variants[0].barcodes).toEqual(['8935001234567', 'NB-0042']);
      expect(model.variants[1].barcodes).toEqual([]);
    });

    it('mã vạch lọc theo TỔ CHỨC, và sắp ỔN ĐỊNH', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'p-1', code: 'GELLI', name: 'Giày Gelli' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getModel('p-1', actor);

      const barcodeSql = sql(3);
      // Cùng luật với mọi truy vấn khác của tầng này: lọc tổ chức Ở TRONG câu
      // lệnh. Thiếu nó thì một mã vạch của tổ chức khác bám vào `item_id` trùng
      // sẽ hiện lên màn của người bán.
      expect(barcodeSql).toContain('b.organization_id = $2');
      // Thứ tự ỔN ĐỊNH: không có nó thì hai lượt gọi trả hai thứ tự khác nhau
      // và mã vạch app bày ra đổi chỗ giữa hai lần mở màn.
      expect(barcodeSql).toContain('ORDER BY b.created_at ASC, b.code ASC');
      expect(dataSource.query.mock.calls[3][1]).toEqual(['p-1', actor.organizationId]);
    });

    it('nhãn của biến thể ĐÃ NGỪNG BÁN không bám vào biến thể nào', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'p-1', code: 'GELLI', name: 'Giày Gelli' }])
        .mockResolvedValueOnce([
          {
            id: 'i-1',
            code: 'GELLI-D-39',
            name: 'Giày Gelli',
            variantLabel: 'D · 39',
            unit: 'đôi',
            sellingPrice: 590000,
          },
        ])
        .mockResolvedValueOnce([
          {
            itemId: 'i-1',
            attributeName: 'Size',
            attributeSort: 0,
            valueLabel: '39',
            valueSort: 0,
          },
          // `i-dead` ngừng bán nên không có trong `variants`. Để nó lọt vào
          // `perVariant` thì client dò tổ hợp ra một id không bán được.
          {
            itemId: 'i-dead',
            attributeName: 'Size',
            attributeSort: 0,
            valueLabel: '40',
            valueSort: 1,
          },
        ]);

      const model = await service.getModel('p-1', actor);

      expect(model.variants).toHaveLength(1);
      expect(model.variants[0].attributes).toEqual([
        { name: 'Size', value: '39' },
      ]);
      // **LẬT quyết định cũ, 2026-09-10.** Bản đầu bày cả `40` với lý do ghi
      // ngay đây: *"nó là một nhãn đã cấu hình của mẫu mã, và giấu nó đi thì
      // người dùng không hiểu vì sao size của mình không có ở đây"*.
      //
      // Lý lẽ đó có phần đúng, nhưng hậu quả đo được nặng hơn. Trên dữ liệu dev,
      // mẫu mã `ABA2950` bày Color [BO, D] × Size [38..44] = **14 tổ hợp** mà
      // chỉ có **1** biến thể bán được (D + 39). Người dùng chọn BO + 38 rồi bị
      // app bảo *"Chọn đủ thuộc tính để thêm vào đơn"* — đúng cái họ vừa làm.
      // Không có lỗi nào để lần ra, chỉ một câu nhắc lặp lại.
      //
      // Một nhãn không dẫn tới đâu thì tệ hơn một nhãn vắng mặt: cái sau nói
      // "không có", cái trước nói "có" rồi im lặng. Ngày nào muốn bày lại thì
      // phải bày kèm trạng thái VÔ HIỆU HOÁ và lý do — không phải bày trần.
      expect(model.attributes[0].options).toEqual(['39']);
    });

    it('lọc theo tổ chức Ở TRONG câu lệnh, không sau khi lấy về', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await service.getModel('p-1', actor).catch(() => undefined);

      expect(String(dataSource.query.mock.calls[0][0])).toContain(
        'p.organization_id = $2',
      );
      expect(dataSource.query.mock.calls[0][1]).toEqual(['p-1', 'org-1']);
    });
  });
  describe('lọc theo NHÓM HÀNG HOÁ gộp cả cây con', () => {
    // Bản đầu lọc `item.category_id = :categoryId`, khớp ĐÚNG một nhóm. Đo trên
    // dữ liệu dev 2026-09-10: nhóm CHA *Giày dép* trả về **0** dòng trong khi
    // nhóm con *Giày nhập* trả về 1 — vì hàng hoá luôn gán vào nhóm LÁ. App vì
    // thế phải bày nhóm cha thành tiêu đề không chạm được, tức một hạn chế của
    // backend đội lốt một quyết định giao diện.

    it('hỏi cây con TRƯỚC, rồi lọc theo TẬP id — không phải một id', async () => {
      dataSource.query.mockResolvedValueOnce([{ id: 'cat-cha' }, { id: 'cat-con' }]);

      await runItems({ categoryId: 'cat-cha' });

      expect(sql(0)).toContain('WITH RECURSIVE');
      expect(conditions()).toContain('item.categoryId IN (:...categoryIds)');
      const call = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('categoryIds'));
      expect(call?.[1]).toEqual({ categoryIds: ['cat-cha', 'cat-con'] });
    });

    it('id KHÔNG thuộc tổ chức → lọc theo CHÍNH nó, không phải bỏ lọc', async () => {
      // Cây con rỗng nghĩa là id không tra ra gì. Trả `undefined` ở đó là BỎ bộ
      // lọc — tức một id sai sẽ phơi TOÀN BỘ danh mục thay vì trả 0 dòng.
      dataSource.query.mockResolvedValueOnce([]);

      await runItems({ categoryId: 'cat-cua-to-chuc-khac' });

      const call = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('categoryIds'));
      expect(call?.[1]).toEqual({ categoryIds: ['cat-cua-to-chuc-khac'] });
    });

    it('KHÔNG gửi `categoryId` thì không hỏi cây con, và không có mệnh đề nhóm', async () => {
      await runItems();

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(conditions()).not.toContain('categoryIds');
    });

    it('nhánh MẪU MÃ lọc bằng `ANY(...)` trên mảng, không bằng `=`', async () => {
      // Nhánh này là SQL thô, không đi qua query builder — nó có đường lọc
      // RIÊNG, nên sửa một nhánh mà quên nhánh kia là chuyện đã suýt xảy ra.
      dataSource.query
        .mockResolvedValueOnce([{ id: 'cat-cha' }, { id: 'cat-con' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }]);

      await run({ categoryId: 'cat-cha' });

      expect(sql(1)).toContain('category_id = ANY(');
      expect(sql(1)).not.toMatch(/category_id = \$\d+\b/);
    });
  });

});
