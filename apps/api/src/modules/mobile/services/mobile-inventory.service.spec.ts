import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchService } from '../../branch/branch.service';
import {
  MobileInventoryKind,
  MobileInventoryLevel,
  MobileInventorySort,
  MobileInventoryStatus,
} from '../dto/mobile-inventory-product-list.query.dto';
import { MobileInventoryService } from './mobile-inventory.service';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';
const BRANCH_OTHER = '20000000-0000-4000-8000-0000000000ff';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A, BRANCH_B],
  roles: [],
};

/**
 * Truy vấn chạy bằng SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là
 * chính câu lệnh: phạm vi tổ chức, tập chi nhánh, mệnh đề mượn từ web, thứ tự
 * sắp xếp. Đầu-cuối đã kiểm bằng curl lên server dev khi viết; e2e cần
 * database nên các ca ở đây là lưới duy nhất chạy được ở mọi máy.
 */
describe('MobileInventoryService', () => {
  let service: MobileInventoryService;
  let query: jest.Mock;
  let listMyBranches: jest.Mock;

  const stubRows = [
    {
      id: 'p-1',
      code: 'GELLI',
      name: 'Giày Gelli',
      unit: 'đôi',
      quantity: 36,
      stockValue: 12600000,
      groupId: 'g-1',
    },
  ];
  const stubTotals = [{ total: 7, totalQuantity: 40, totalValue: 13000000 }];

  beforeEach(async () => {
    query = jest.fn();
    listMyBranches = jest.fn().mockResolvedValue([
      { id: BRANCH_A, name: 'Main Branch' },
      { id: BRANCH_B, name: 'Cà Mau' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileInventoryService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: BranchService, useValue: { listMyBranches } },
      ],
    }).compile();

    service = module.get(MobileInventoryService);
  });

  const baseProductQuery = {
    page: 1,
    limit: 20,
    kind: MobileInventoryKind.ON_HAND,
    status: MobileInventoryStatus.ALL,
    sort: MobileInventorySort.QUANTITY_DESC,
    level: MobileInventoryLevel.PRODUCT,
  };

  describe('listProducts', () => {
    /** `listProducts` gọi query() hai lần qua Promise.all: dataSql rồi totalsSql. */
    const arm = () =>
      query.mockResolvedValueOnce(stubRows).mockResolvedValueOnce(stubTotals);
    const run = (overrides: Partial<Parameters<typeof service.listProducts>[0]> = {}) => {
      arm();
      return service.listProducts({ ...baseProductQuery, ...overrides }, actor);
    };
    const dataSql = (): string => query.mock.calls[0][0] as string;
    const dataParams = (): unknown[] => query.mock.calls[0][1] as unknown[];
    const totalsSql = (): string => query.mock.calls[1][0] as string;
    const totalsParams = (): unknown[] => query.mock.calls[1][1] as unknown[];

    it('phạm vi TỔ CHỨC đi qua tham số $1, không nội suy vào câu lệnh', async () => {
      await run();

      expect(dataParams()[0]).toBe('org-1');
      expect(dataSql()).toContain('sle.organization_id = $1');
      expect(dataSql()).toContain('i.organization_id = $1');
      expect(dataSql()).not.toContain('org-1');
    });

    it('branchIds vắng -> lấy trọn tập chi nhánh trong JWT, KHÔNG mở toàn tổ chức', async () => {
      await run();

      expect(dataParams()).toContain(actor.branchIds);
      expect(dataSql()).toContain('st.branch_id = ANY($3::uuid[])');
    });

    it('JWT không có chi nhánh nào -> vẫn truy vấn với mảng rỗng (trang rỗng)', async () => {
      arm();
      await service.listProducts(baseProductQuery, { ...actor, branchIds: [] });

      expect(dataParams()[2]).toEqual([]);
    });

    it('branchIds có phần tử ngoài JWT -> 403 tiếng Việt, không chạm database', async () => {
      await expect(
        service.listProducts(
          { ...baseProductQuery, branchIds: [BRANCH_A, BRANCH_OTHER] },
          actor,
        ),
      ).rejects.toThrow(
        new ForbiddenException('Bạn không có quyền xem tồn kho của cửa hàng này.'),
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('kind=in_transit đọc PHIẾU CHUYỂN theo chi nhánh NGUỒN, không đụng sổ cái; câu ngoài không đổi', async () => {
      await run({ kind: MobileInventoryKind.IN_TRANSIT, asOf: '2026-09-11' });

      const sql = dataSql();
      expect(sql).toContain('FROM transfer_orders t');
      expect(sql).toContain("t.status = 'IN_PROGRESS'");
      expect(sql).toContain('t.deleted_at IS NULL');
      expect(sql).toContain('t.source_branch_id = ANY($3::text[])');
      expect(sql).toContain('COALESCE(l.source_storage_id, t.source_storage_id)');
      expect(sql).toContain('COALESCE(export_price.unit_price, i.purchase_price, 0)');
      expect(sql).not.toContain('stock_ledger_entries');
      // Câu đứng sau CTE `cells` giống hệt nhánh sổ cái.
      expect(sql).toContain('SELECT id, code, name, unit, quantity, "stockValue", "groupId"');
      // Tham số đã bind mà nhánh này không đọc vẫn được tham chiếu — Postgres
      // từ chối tham số không dùng.
      expect(sql).toContain('$2::text IS NOT NULL');
      expect(dataParams().slice(0, 3)).toEqual(['org-1', '2026-09-11', actor.branchIds]);
    });

    it('kind=incoming đọc theo chi nhánh ĐÍCH, kho đích null lùi về kho nhận mặc định', async () => {
      await run({ kind: MobileInventoryKind.INCOMING });

      const sql = dataSql();
      expect(sql).toContain('t.destination_branch_id = ANY($3::text[])');
      expect(sql).toContain('t.destination_storage_id');
      expect(sql).toContain('d.is_default_receiving = true');
      expect(sql).toContain('d.branch_id::text = t.destination_branch_id');
    });

    it('asOf bao trọn ngày: so `< $n::date + 1 day`; vắng thì lấy hôm nay', async () => {
      await run({ asOf: '2026-08-31' });
      expect(dataParams()[1]).toBe('2026-08-31');
      expect(dataSql()).toContain("sle.posted_at < ($2::date + INTERVAL '1 day')");

      query.mockReset();
      await run();
      expect(dataParams()[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('mượn đúng mệnh đề của web: phiếu huỷ, is_tracked, kho/vị trí/hàng active', async () => {
      await run();

      const sql = dataSql();
      expect(sql).toContain("sle.reference_type = 'GOODS_RECEIPT'");
      expect(sql).toContain("gix.status = 'CANCELLED'");
      expect(sql).toContain('COALESCE(sb.is_tracked, true) = true');
      expect(sql).toContain('LEFT  JOIN stock_balances sb');
      expect(sql).toContain('loc.is_active = true');
      expect(sql).toContain('st.is_active  = true');
      expect(sql).toContain('i.is_active = true');
    });

    it('level=product gộp theo mẫu mã, level=variant theo từng item', async () => {
      await run({ level: MobileInventoryLevel.PRODUCT });
      expect(dataSql()).toContain('GROUP BY COALESCE(i.product_id, i.id), p.id, p.code, p.name');
      expect(dataSql()).toContain('COALESCE(p.code, p.name, MIN(i.code))');

      query.mockReset();
      await run({ level: MobileInventoryLevel.VARIANT });
      expect(dataSql()).toContain('GROUP BY i.id, i.code, i.name, i.unit, i.category_id');
    });

    it('status lọc trên tổng đã gộp; `all` không thêm mệnh đề', async () => {
      await run({ status: MobileInventoryStatus.OUT_OF_STOCK });
      expect(dataSql()).toContain('WHERE quantity <= 0');

      query.mockReset();
      await run({ status: MobileInventoryStatus.IN_STOCK });
      expect(dataSql()).toContain('WHERE quantity > 0');

      query.mockReset();
      await run({ status: MobileInventoryStatus.ALL });
      expect(dataSql()).not.toContain('WHERE quantity');
    });

    it.each([
      [MobileInventorySort.QUANTITY_ASC, 'ORDER BY quantity ASC, lower(code) ASC, id ASC'],
      [MobileInventorySort.QUANTITY_DESC, 'ORDER BY quantity DESC, lower(code) ASC, id ASC'],
      [MobileInventorySort.VALUE_ASC, 'ORDER BY "stockValue" ASC, lower(code) ASC, id ASC'],
      [MobileInventorySort.VALUE_DESC, 'ORDER BY "stockValue" DESC, lower(code) ASC, id ASC'],
    ])('sort=%s -> %s (luôn kết bằng id)', async (sort, expected) => {
      await run({ sort });

      expect(dataSql()).toContain(expected);
    });

    it('search đi qua tham số ILIKE đã escape ký tự đại diện', async () => {
      await run({ search: ' 50% ' });

      expect(dataParams()).toContain('%50\\%%');
      expect(dataSql()).toMatch(/COALESCE\(code, ''\) ILIKE \$\d+ OR COALESCE\(name, ''\) ILIKE \$\d+/);
    });

    it('unit so không phân biệt hoa/thường; categoryId lọc cả cây con', async () => {
      await run({ unit: 'Đôi', categoryId: 'cat-1' });

      expect(dataSql()).toContain('lower(i.unit) = lower($4)');
      expect(dataSql()).toContain('root.id = $5');
      expect(dataSql()).toContain('WITH RECURSIVE category_tree');
      expect(dataParams()).toEqual(['org-1', expect.any(String), actor.branchIds, 'Đôi', 'cat-1', 20, 0]);
    });

    it('câu tổng dùng CÙNG mệnh đề lọc, không LIMIT, tham số không mang phân trang', async () => {
      await run({ page: 3, limit: 5, status: MobileInventoryStatus.IN_STOCK });

      expect(dataSql()).toContain('LIMIT $4 OFFSET $5');
      expect(dataParams().slice(-2)).toEqual([5, 10]);
      expect(totalsSql()).toContain('WHERE quantity > 0');
      expect(totalsSql()).not.toContain('LIMIT');
      expect(totalsParams()).toEqual(dataParams().slice(0, -2));
    });

    it('trả envelope {data,total,page,limit,totalQuantity,totalValue}', async () => {
      const result = await run({ page: 2, limit: 5 });

      expect(result).toEqual({
        data: stubRows,
        total: 7,
        page: 2,
        limit: 5,
        totalQuantity: 40,
        totalValue: 13000000,
      });
    });

    it('KHÔNG SELECT giá vốn hay cột nào ngoài hợp đồng', async () => {
      await run();

      expect(dataSql()).toContain('SELECT id, code, name, unit, quantity, "stockValue", "groupId"');
      expect(dataSql()).not.toContain('purchase_price');
    });
  });

  describe('listStores', () => {
    const storageRows = [
      { branchId: BRANCH_A, id: 's-1', name: 'Kho chính', quantity: 10, stockValue: 1000, periodIn: 3, periodOut: 1 },
      { branchId: BRANCH_A, id: 's-2', name: 'Kho dự trữ', quantity: -2, stockValue: -200, periodIn: 0, periodOut: 4 },
    ];
    const run = (overrides: { asOf?: string; branchIds?: string[] } = {}) => {
      query.mockResolvedValueOnce(storageRows);
      return service.listStores(
        { kind: MobileInventoryKind.ON_HAND, ...overrides },
        actor,
      );
    };
    const sql = (): string => query.mock.calls[0][0] as string;
    const params = (): unknown[] => query.mock.calls[0][1] as unknown[];

    it('kỳ nhập-xuất = đầu tháng của asOf -> asOf, đi qua tham số', async () => {
      await run({ asOf: '2026-09-11' });

      expect(params()).toEqual(['org-1', '2026-09-11', actor.branchIds, '2026-09-01']);
      expect(sql()).toContain('sle.posted_at >= $4::date AND sle.quantity > 0');
      expect(sql()).toContain('sle.posted_at >= $4::date AND sle.quantity < 0');
      expect(sql()).toContain('ABS(sle.quantity)');
    });

    it('đi từ storages LEFT JOIN cells để kho trống vẫn có dòng, kho chính đứng đầu', async () => {
      await run();

      expect(sql()).toContain('FROM storages st');
      expect(sql()).toContain('LEFT JOIN cells c ON c.storage_id = st.id');
      expect(sql()).toContain('ORDER BY st.branch_id, st.is_main_storage DESC, lower(st.name), st.id');
    });

    it('gộp kho theo chi nhánh, giữ thứ tự của listMyBranches, chi nhánh không kho vẫn có thẻ', async () => {
      const result = await run();

      expect(result).toEqual([
        {
          id: BRANCH_A,
          name: 'Main Branch',
          quantity: 8,
          stockValue: 800,
          periodIn: 3,
          periodOut: 5,
          storages: [
            { id: 's-1', name: 'Kho chính', quantity: 10 },
            { id: 's-2', name: 'Kho dự trữ', quantity: -2 },
          ],
        },
        {
          id: BRANCH_B,
          name: 'Cà Mau',
          quantity: 0,
          stockValue: 0,
          periodIn: 0,
          periodOut: 0,
          storages: [],
        },
      ]);
    });

    it('branchIds thu hẹp danh sách thẻ, không chỉ thu hẹp SQL', async () => {
      const result = await run({ branchIds: [BRANCH_B] });

      expect(params()[2]).toEqual([BRANCH_B]);
      expect(result.map((s) => s.id)).toEqual([BRANCH_B]);
    });

    it('branchIds ngoài JWT -> 403, không chạm database', async () => {
      await expect(
        service.listStores({ kind: MobileInventoryKind.ON_HAND, branchIds: [BRANCH_OTHER] }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('kind pending: thẻ cửa hàng đi từ storages LEFT JOIN cells của phiếu chuyển, ba cột kỳ = 0', async () => {
      query.mockResolvedValueOnce([]);
      await service.listStores({ kind: MobileInventoryKind.IN_TRANSIT }, actor);

      expect(sql()).toContain('FROM transfer_orders t');
      expect(sql()).toContain('0::float                                AS period_in');
      expect(sql()).toContain('LEFT JOIN cells c ON c.storage_id = st.id');
      expect(sql()).not.toContain('stock_ledger_entries');
    });

    it('CTE cells là CHUNG với listProducts — cùng một mảnh đặc trưng', async () => {
      await run();
      const storesSql = sql();

      query.mockReset();
      query.mockResolvedValueOnce(stubRows).mockResolvedValueOnce(stubTotals);
      await service.listProducts(baseProductQuery, actor);
      const productsSql = query.mock.calls[0][0] as string;

      const marker = 'COALESCE(SUM(sle.line_value), 0)::float AS value';
      expect(storesSql).toContain(marker);
      expect(productsSql).toContain(marker);
    });
  });

  describe('findStore', () => {
    it('trả đúng một thẻ theo branchId', async () => {
      query.mockResolvedValueOnce([]);

      const result = await service.findStore(
        BRANCH_B,
        { kind: MobileInventoryKind.ON_HAND },
        actor,
      );

      expect(result.id).toBe(BRANCH_B);
      expect(result.storages).toEqual([]);
    });

    it('chi nhánh trong JWT nhưng không còn ACTIVE -> 404 tiếng Việt', async () => {
      listMyBranches.mockResolvedValue([{ id: BRANCH_A, name: 'Main Branch' }]);
      query.mockResolvedValueOnce([]);

      await expect(
        service.findStore(BRANCH_B, { kind: MobileInventoryKind.ON_HAND }, actor),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy cửa hàng.'));
    });

    it('chi nhánh ngoài JWT -> 403, không chạm database', async () => {
      await expect(
        service.findStore(BRANCH_OTHER, { kind: MobileInventoryKind.ON_HAND }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });
});
