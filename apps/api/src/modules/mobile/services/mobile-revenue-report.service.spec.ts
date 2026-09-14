import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileRevenueTimeUnit } from '../dto/mobile-revenue-report.query.dto';
import { MobileRevenueReportService } from './mobile-revenue-report.service';
import { revenueLinesSql } from './mobile-revenue-report.sql';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';
const BRANCH_C = '20000000-0000-4000-8000-000000000003';
const PRODUCT_ID = 'a0000000-0000-4000-8000-000000000001';
const CATEGORY_ID = 'c0000000-0000-4000-8000-000000000001';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A, BRANCH_B],
  roles: [],
};

const range = { from: '2026-09-01', to: '2026-09-30' };

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh (công thức, điều kiện lọc, phạm vi chi nhánh, tham số bind)
 * và phần ghép trong TS (tổng, lấp mốc, 404). Cùng giới hạn đã ghi ở
 * `mobile-business-report.service.spec.ts`.
 */
describe('MobileRevenueReportService', () => {
  let service: MobileRevenueReportService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileRevenueReportService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    service = module.get(MobileRevenueReportService);
  });

  describe('công thức khớp web revenue-by-item', () => {
    it('loại hoá đơn huỷ, dấu theo direction, trừ khuyến mãi engine — ở MỌI câu', async () => {
      await service.listItems({ ...range, page: 1, limit: 20 }, actor);
      await service.listCategories(range, actor);
      await service.getTimeline({ ...range, unit: MobileRevenueTimeUnit.DAY }, actor);

      for (const [sql] of query.mock.calls) {
        expect(sql).toContain(`i.status <> 'cancelled'`);
        expect(sql).toContain(`WHEN li.direction = 'OUT' THEN 1 ELSE -1 END`);
        expect(sql).toContain('(li.line_total - li.promotion_discount)');
        expect(sql).toContain('COALESCE(it.product_id, li.item_id)');
        expect(sql).toContain('LEFT JOIN items it');
      }
    });

    it('kỳ bind ở $2/$3, bao trọn ngày cuối', async () => {
      await service.listCategories(range, actor);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('i.issued_at >= $2::date');
      expect(sql).toContain(`i.issued_at < ($3::date + INTERVAL '1 day')`);
      expect(params.slice(0, 3)).toEqual(['org-1', '2026-09-01', '2026-09-30']);
    });
  });

  describe('phạm vi chi nhánh', () => {
    it('vắng branchIds → bind tập phân công ở $4', async () => {
      await service.listCategories(range, actor);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('i.branch_id = ANY($4::text[])');
      expect(params).toEqual(['org-1', '2026-09-01', '2026-09-30', [BRANCH_A, BRANCH_B]]);
    });

    it('xin ngoài phân công → 403 trước khi chạm DB', async () => {
      await expect(
        service.listCategories({ ...range, branchIds: [BRANCH_C] }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('xin trong phân công → đúng tập xin', async () => {
      await service.listCategories({ ...range, branchIds: [BRANCH_B] }, actor);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('i.branch_id = ANY($4::text[])');
      expect(params[3]).toEqual([BRANCH_B]);
    });

    it('không phân công → 403 dù là ai — mobile không có vế hợp nhất', async () => {
      await expect(
        service.listCategories(range, { ...actor, branchIds: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('listItems', () => {
    it('câu dữ liệu có LIMIT/OFFSET bind sau; câu tổng dùng cùng tham số phạm vi, không phân trang', async () => {
      query
        .mockResolvedValueOnce([
          { id: PRODUCT_ID, code: 'AK01', name: 'Áo', unit: 'Cái', quantity: 3, revenue: 1500000.004 },
        ])
        .mockResolvedValueOnce([{ total: 7, totalQuantity: 10, totalRevenue: 9000000 }]);

      const result = await service.listItems({ ...range, page: 2, limit: 20 }, actor);

      const [dataSql, dataParams] = query.mock.calls[0];
      const [totalsSql, totalsParams] = query.mock.calls[1];
      expect(dataSql).toContain('LIMIT $5 OFFSET $6');
      expect(dataSql).toContain('ORDER BY revenue DESC, code ASC, id ASC');
      expect(dataParams.slice(4)).toEqual([20, 20]);
      expect(totalsSql).not.toContain('LIMIT');
      expect(totalsSql).toContain('COUNT(*)::int');
      expect(totalsParams).toEqual(dataParams.slice(0, 4));

      expect(result).toEqual({
        data: [{ id: PRODUCT_ID, code: 'AK01', name: 'Áo', unit: 'Cái', quantity: 3, revenue: 1500000 }],
        total: 7,
        page: 2,
        limit: 20,
        totalQuantity: 10,
        totalRevenue: 9000000,
      });
    });

    it('không có dòng → tổng 0, không phải undefined', async () => {
      const result = await service.listItems({ ...range, page: 1, limit: 20 }, actor);
      expect(result).toMatchObject({ data: [], total: 0, totalQuantity: 0, totalRevenue: 0 });
    });

    describe('search', () => {
      it('lọc trên mã/tên mẫu mã và tên nhóm, MỘT tham số dùng cho cả ba cột', async () => {
        await service.listItems({ ...range, page: 1, limit: 20, search: 'áo' }, actor);

        const [dataSql, dataParams] = query.mock.calls[0];

        expect(dataSql).toContain('subject_code ILIKE $5');
        expect(dataSql).toContain('subject_name ILIKE $5');
        expect(dataSql).toContain('category_name ILIKE $5');
        expect(dataParams[4]).toBe('%áo%');

        // Grain của đường này là MẪU MÃ: mã/tên biến thể cố ý không được tìm,
        // đúng nhánh `parent` của web. Đây là cái chốt duy nhất giữ điều đó.
        expect(dataSql).not.toContain('item_code ILIKE');
        expect(dataSql).not.toContain('item_name ILIKE');
      });

      it('câu TỔNG cũng lọc, và chia đúng tham số với câu dữ liệu', async () => {
        query
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: 2, totalQuantity: 5, totalRevenue: 500 }]);

        await service.listItems({ ...range, page: 1, limit: 20, search: 'áo' }, actor);

        const [dataSql, dataParams] = query.mock.calls[0];
        const [totalsSql, totalsParams] = query.mock.calls[1];

        // Thiếu vế này thì thanh Tổng nói về một tập khác các dòng bên dưới,
        // và `total` (nguồn của `hasMore`) đếm trên tập chưa lọc.
        expect(totalsSql).toContain('subject_code ILIKE $5');
        expect(totalsSql).not.toContain('LIMIT');

        // Tham số của `search` phải bind TRƯỚC khi chụp `totalsParams`; sai thứ
        // tự là Postgres ném "bind message supplies N parameters".
        expect(totalsParams).toEqual(dataParams.slice(0, 5));
        expect(totalsParams[4]).toBe('%áo%');
      });

      it('rỗng / toàn khoảng trắng → không thêm mệnh đề nào', async () => {
        for (const search of ['', '   ', undefined]) {
          query.mockClear();
          await service.listItems({ ...range, page: 1, limit: 20, search }, actor);

          const [dataSql, dataParams] = query.mock.calls[0];
          expect(dataSql).not.toContain('ILIKE');
          expect(dataSql).toContain('LIMIT $5 OFFSET $6');
          expect(dataParams).toHaveLength(6);
        }
      });

      it('cắt khoảng trắng thừa quanh từ khoá', async () => {
        await service.listItems({ ...range, page: 1, limit: 20, search: '  áo  ' }, actor);
        expect(query.mock.calls[0][1][4]).toBe('%áo%');
      });
    });
  });

  describe('listCategories', () => {
    it('bỏ dòng chưa xếp nhóm (như web statBy=group) và cộng tổng từ các nhóm', async () => {
      query.mockResolvedValueOnce([
        { id: CATEGORY_ID, name: 'Giày dép', revenue: 700 },
        { id: 'c2', name: 'Phụ kiện', revenue: 300.005 },
      ]);

      const result = await service.listCategories(range, actor);

      expect(query.mock.calls[0][0]).toContain('WHERE category_id IS NOT NULL');
      expect(result.data.map((c) => c.revenue)).toEqual([700, 300.01]);
      expect(result.totalRevenue).toBe(1000.01);
    });
  });

  describe('getTimeline', () => {
    it('hour: gộp theo giờ, trả đủ 24 mốc, mốc trống = 0, tổng = Σ ô', async () => {
      query.mockResolvedValueOnce([
        { bucket: '9', revenue: 5 },
        { bucket: '21', revenue: 7 },
      ]);

      const result = await service.getTimeline(
        { ...range, unit: MobileRevenueTimeUnit.HOUR },
        actor,
      );

      expect(query.mock.calls[0][0]).toContain('EXTRACT(HOUR FROM issued_at)::int::text');
      expect(result.unit).toBe(MobileRevenueTimeUnit.HOUR);
      expect(result.data).toHaveLength(24);
      expect(result.data[9]).toEqual({ start: '2026-09-01T09:00:00', revenue: 5 });
      expect(result.data[21]).toEqual({ start: '2026-09-01T21:00:00', revenue: 7 });
      expect(result.data[0].revenue).toBe(0);
      expect(result.totalRevenue).toBe(12);
    });

    it('month: khoá theo date_trunc và đủ tháng của kỳ', async () => {
      query.mockResolvedValueOnce([{ bucket: '2026-09-01T00:00:00', revenue: 100 }]);

      const result = await service.getTimeline(
        { from: '2026-08-15', to: '2026-10-02', unit: MobileRevenueTimeUnit.MONTH },
        actor,
      );

      expect(query.mock.calls[0][0]).toContain(`date_trunc('month', issued_at)`);
      expect(result.data.map((p) => [p.start, p.revenue])).toEqual([
        ['2026-08-01T00:00:00', 0],
        ['2026-09-01T00:00:00', 100],
        ['2026-10-01T00:00:00', 0],
      ]);
    });
  });

  describe('màn con của một mặt hàng', () => {
    const header = { id: PRODUCT_ID, code: 'AK01', name: 'Áo', unit: 'Cái' };

    it('branches: tra header ở catalogue trước, lọc đúng mặt hàng ở $5, header mang tổng của data', async () => {
      query
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce([
          { id: BRANCH_A, name: 'Cửa hàng A', quantity: 2, revenue: 400 },
          { id: BRANCH_B, name: 'Cửa hàng B', quantity: 1, revenue: 100 },
        ]);

      const result = await service.listBranchesOfItem(PRODUCT_ID, range, actor);

      const [headerSql, headerParams] = query.mock.calls[0];
      expect(headerSql).toContain('FROM products p');
      expect(headerSql).toContain('it.product_id IS NULL');
      expect(headerParams).toEqual(['org-1', PRODUCT_ID]);

      const [sql, params] = query.mock.calls[1];
      expect(sql).toContain('COALESCE(it.product_id, li.item_id) = $5::uuid');
      expect(sql).toContain('LEFT JOIN branches b ON b.id::text = l.branch_id');
      expect(params[4]).toBe(PRODUCT_ID);

      expect(result.item).toEqual({ ...header, quantity: 3, revenue: 500 });
      expect(result.data).toHaveLength(2);
    });

    it('variants: gộp theo item, header lấy số lượng từ cùng CTE', async () => {
      query
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce([
          { id: 'i1', code: 'AK01-39', name: 'Áo 39', revenue: 300 },
          { id: 'i2', code: 'AK01-40', name: 'Áo 40', revenue: 200 },
        ])
        .mockResolvedValueOnce([{ quantity: 5 }]);

      const result = await service.listVariantsOfItem(PRODUCT_ID, range, actor);

      expect(query.mock.calls[1][0]).toContain('GROUP BY item_id');
      expect(query.mock.calls[2][0]).toContain('SUM(qty)');
      expect(query.mock.calls[2][1]).toEqual(query.mock.calls[1][1]);
      expect(result.item).toEqual({ ...header, quantity: 5, revenue: 500 });
      expect(result.data.map((v) => v.code)).toEqual(['AK01-39', 'AK01-40']);
    });

    it('id không có trong catalogue → 404, không chạy câu gộp', async () => {
      await expect(
        service.listBranchesOfItem(PRODUCT_ID, range, actor),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy hàng hoá.'));
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('màn con của một nhóm hàng', () => {
    it('lọc đúng nhóm ở $5, dòng cùng hình dạng trang 1, header mang tổng', async () => {
      query
        .mockResolvedValueOnce([{ id: CATEGORY_ID, name: 'Giày dép' }])
        .mockResolvedValueOnce([
          { id: PRODUCT_ID, code: 'G1', name: 'Giày', unit: 'Đôi', quantity: 4, revenue: 800 },
        ]);

      const result = await service.listItemsOfCategory(CATEGORY_ID, range, actor);

      const [sql, params] = query.mock.calls[1];
      expect(sql).toContain('it.category_id = $5::uuid');
      expect(sql).toContain('GROUP BY subject_id');
      expect(params[4]).toBe(CATEGORY_ID);
      expect(result.category).toEqual({ id: CATEGORY_ID, name: 'Giày dép', revenue: 800 });
      expect(result.data[0]).toMatchObject({ code: 'G1', quantity: 4 });
    });

    it('nhóm không tồn tại → 404', async () => {
      await expect(
        service.listItemsOfCategory(CATEGORY_ID, range, actor),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy nhóm hàng.'));
    });
  });
});

/**
 * `revenueLinesSql` mở tham số `dateColumn` cho "Doanh thu ước tính". Khoá
 * hai điều: KHÔNG truyền thì chuỗi SQL vẫn lọc `issued_at` (ba service đang
 * dùng không đổi), và truyền `created_at` thì nháp bị loại tường minh —
 * nháp có ngày tạo nhưng không phải đơn.
 */
describe('revenueLinesSql — dateColumn', () => {
  const params = { fromParam: '$2', toParam: '$3', branchesParam: '$4' };

  it('mặc định vẫn là issued_at', () => {
    const sql = revenueLinesSql(params);
    expect(sql).toContain('i.issued_at >= $2::date');
    expect(sql).toContain(`i.issued_at < ($3::date + INTERVAL '1 day')`);
    expect(sql).not.toContain('i.created_at >=');
  });

  it('created_at → lọc created_at và giữ is_draft = false', () => {
    const sql = revenueLinesSql({ ...params, dateColumn: 'created_at' });
    expect(sql).toContain('i.created_at >= $2::date');
    expect(sql).toContain(`i.created_at < ($3::date + INTERVAL '1 day')`);
    expect(sql).toContain('i.is_draft = false');
    expect(sql).toContain(`i.status <> 'cancelled'`);
  });
});
