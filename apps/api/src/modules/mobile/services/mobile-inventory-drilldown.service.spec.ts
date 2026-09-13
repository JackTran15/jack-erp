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
import { MobileInventoryVoucherSort } from '../dto/mobile-inventory-voucher-list.query.dto';
import { MobileInventoryDrilldownService } from './mobile-inventory-drilldown.service';
import { MobileInventoryService } from './mobile-inventory.service';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';
const BRANCH_OTHER = '20000000-0000-4000-8000-0000000000ff';
const PRODUCT = 'a0000000-0000-4000-8000-000000000001';
const ITEMS = [
  { id: 'a3000000-0000-4000-8000-000000000001', unit: 'đôi' },
  { id: 'a3000000-0000-4000-8000-000000000002', unit: 'đôi' },
];

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A, BRANCH_B],
  roles: [],
};

const ON_HAND = { kind: MobileInventoryKind.ON_HAND };

/**
 * SQL thô, nên phần kiểm được mà KHÔNG cần Postgres là chính câu lệnh. Đầu-cuối
 * đã kiểm bằng curl lên server dev khi viết (tổng biến thể = dòng mẫu mã, tồn
 * cuối kỳ luồng = thẻ cửa hàng); các ca ở đây là lưới chạy được ở mọi máy.
 *
 * Mọi method gọi `resolveSubjects` TRƯỚC — tức `query()` lần đầu luôn là câu
 * tra item; các helper dưới đây đọc lần gọi thứ hai trở đi.
 */
describe('MobileInventoryDrilldownService', () => {
  let service: MobileInventoryDrilldownService;
  let main: MobileInventoryService;
  let query: jest.Mock;
  let listMyBranches: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    listMyBranches = jest.fn().mockResolvedValue([
      { id: BRANCH_A, name: 'Main Branch' },
      { id: BRANCH_B, name: 'Cà Mau' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileInventoryDrilldownService,
        MobileInventoryService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: BranchService, useValue: { listMyBranches } },
      ],
    }).compile();

    service = module.get(MobileInventoryDrilldownService);
    main = module.get(MobileInventoryService);
  });

  const subjectSql = (): string => query.mock.calls[0][0] as string;
  const subjectParams = (): unknown[] => query.mock.calls[0][1] as unknown[];
  const sqlAt = (n: number): string => query.mock.calls[n][0] as string;
  const paramsAt = (n: number): unknown[] => query.mock.calls[n][1] as unknown[];

  describe('resolveSubjects (chung cho mọi đường)', () => {
    it('trải id hỗn hợp bằng MỘT câu: product_id = $2 OR id = $2, scope $1', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([]);

      await service.listVariants(PRODUCT, ON_HAND, actor);

      expect(subjectParams()).toEqual(['org-1', PRODUCT]);
      expect(subjectSql()).toContain('(i.product_id = $2 OR i.id = $2)');
      expect(subjectSql()).toContain('i.organization_id = $1');
      expect(subjectSql()).not.toContain('org-1');
    });

    it('không ra item nào -> 404 tiếng Việt, không chạy câu dữ liệu', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.listVariants(PRODUCT, ON_HAND, actor)).rejects.toThrow(
        new NotFoundException('Không tìm thấy hàng hoá.'),
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('chi nhánh lạ -> 403 TRƯỚC khi tra item', async () => {
      await expect(
        service.listStoresOf(PRODUCT, { ...ON_HAND, branchIds: [BRANCH_OTHER] }, actor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.getFlow({ id: PRODUCT, branchId: BRANCH_OTHER }, ON_HAND, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('listVariants', () => {
    const rows = [
      { id: ITEMS[0].id, code: 'GELLI-39', name: 'Giày 39', unit: 'đôi', quantity: 11, stockValue: 3850000, openingQuantity: 6, periodIn: 5, periodOut: 0 },
    ];

    it('LEFT JOIN cells trên MỌI item active của mẫu mã, sắp theo mã rồi id', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce(rows);

      const result = await service.listVariants(PRODUCT, { ...ON_HAND, asOf: '2026-09-11' }, actor);

      expect(result).toEqual(rows);
      const sql = sqlAt(1);
      expect(sql).toContain('FROM items i');
      expect(sql).toContain('LEFT JOIN cells c ON c.item_id = i.id');
      expect(sql).toContain('i.is_active = true');
      expect(sql).toContain('ORDER BY lower(i.code) ASC, i.id ASC');
      // Tập item đi qua tham số, cả ở CTE lẫn câu ngoài.
      expect(sql).toContain('sle.item_id = ANY($4::uuid[])');
      expect(sql).toContain('i.id = ANY($4::uuid[])');
      expect(paramsAt(1)).toEqual(['org-1', '2026-09-11', actor.branchIds, ITEMS.map((i) => i.id), '2026-09-01']);
    });

    it('có ba cột theo kỳ: opening_qty, period_in, period_out với $m = đầu tháng', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce(rows);

      await service.listVariants(PRODUCT, { ...ON_HAND, asOf: '2026-09-11' }, actor);

      const sql = sqlAt(1);
      expect(sql).toContain('sle.posted_at < $5::date');
      expect(sql).toContain('AS opening_qty');
      expect(sql).toContain('"openingQuantity"');
      expect(sql).toContain('"periodIn"');
      expect(sql).toContain('"periodOut"');
    });
  });

  describe('listStoresOf', () => {
    it('INNER JOIN cells — cửa hàng không có ô nào thì KHÔNG có thẻ', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([
        { branchId: BRANCH_A, id: 's-1', name: 'Kho chính', quantity: 33, stockValue: 1000, periodIn: 10, periodOut: 0 },
      ]);

      const result = await service.listStoresOf(PRODUCT, ON_HAND, actor);

      expect(sqlAt(1)).toContain('INNER JOIN cells c ON c.storage_id = st.id');
      expect(result.map((s) => s.id)).toEqual([BRANCH_A]);
      expect(result[0].storages).toEqual([{ id: 's-1', name: 'Kho chính', quantity: 33 }]);
    });
  });

  describe('getFlow', () => {
    const balances = [{ opening: 23, closing: 33 }];
    const types = [
      { referenceType: 'GOODS_RECEIPT', inQty: 10, inValue: 3500000, outQty: 0, outValue: 0, inCount: 5, outCount: 0 },
      { referenceType: 'INVOICE', inQty: 0, inValue: 0, outQty: 0, outValue: 0, inCount: 0, outCount: 0 },
      { referenceType: 'RETURN_INVOICE', inQty: 2, inValue: 700000, outQty: 1, outValue: 350000, inCount: 1, outCount: 1 },
    ];

    it('chi nhánh trên path thành branchIds một phần tử; hai câu cùng CTE scoped', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce(balances).mockResolvedValueOnce(types);

      await service.getFlow({ id: PRODUCT, branchId: BRANCH_A }, { ...ON_HAND, asOf: '2026-09-11' }, actor);

      expect(paramsAt(1)).toEqual(['org-1', '2026-09-11', [BRANCH_A], ITEMS.map((i) => i.id), '2026-09-01']);
      expect(sqlAt(1)).toContain('WITH scoped AS');
      expect(sqlAt(2)).toContain('WITH scoped AS');
      expect(sqlAt(1)).toContain('st.branch_id = ANY($3::uuid[])');
      expect(sqlAt(2)).toContain('WHERE posted_at >= $5::date');
      expect(sqlAt(2)).toContain('GROUP BY reference_type');
    });

    it('lines mỗi chiều chỉ gồm loại CÓ bút toán ở chiều đó, nhãn tiếng Việt, sắp số lượng giảm dần', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce(balances).mockResolvedValueOnce(types);

      const flow = await service.getFlow({ id: PRODUCT, branchId: BRANCH_A }, ON_HAND, actor);

      expect(flow.storeId).toBe(BRANCH_A);
      expect(flow.openingQuantity).toBe(23);
      expect(flow.closingQuantity).toBe(33);
      expect(flow.inbound).toEqual({
        quantity: 12,
        value: 4200000,
        lines: [
          { name: 'Phiếu nhập kho', quantity: 10, value: 3500000 },
          { name: 'Hoá đơn trả hàng', quantity: 2, value: 700000 },
        ],
      });
      expect(flow.outbound).toEqual({
        quantity: 1,
        value: 350000,
        lines: [{ name: 'Hoá đơn trả hàng', quantity: 1, value: 350000 }],
      });
      // Loại không phát sinh (INVOICE) không xuất hiện ở chiều nào.
      expect(JSON.stringify(flow)).not.toContain('Hoá đơn bán hàng');
    });

    it('không có bút toán nào -> toàn 0 và lines rỗng, không ném', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const flow = await service.getFlow({ id: PRODUCT, branchId: BRANCH_A }, ON_HAND, actor);

      expect(flow.openingQuantity).toBe(0);
      expect(flow.inbound.lines).toEqual([]);
      expect(flow.outbound.lines).toEqual([]);
    });
  });

  describe('listVouchers', () => {
    const voucherRows = [
      { referenceType: 'GOODS_RECEIPT', referenceId: 'gr-1', storageId: 's-1', storageName: 'Kho chính', code: 'NK000011', qty: 5, value: 1750000, postedAt: new Date('2026-09-04T03:43:44.757Z'), documentPurpose: 'PURCHASE' },
      { referenceType: 'INVOICE', referenceId: 'inv-1', storageId: 's-1', storageName: 'Kho chính', code: 'INV-1', qty: -6, value: -2100000, postedAt: new Date('2026-09-02T00:00:00Z'), documentPurpose: null },
      { referenceType: 'INITIAL_STOCK', referenceId: null, storageId: 's-2', storageName: 'Kho dự trữ', code: 'Tồn kho ban đầu', qty: 3, value: 0, postedAt: new Date('2026-09-01T00:00:00Z'), documentPurpose: null },
      { referenceType: 'GOODS_RECEIPT', referenceId: 'gr-2', storageId: 's-1', storageName: 'Kho chính', code: 'PN000003', qty: 2, value: 0, postedAt: new Date('2026-09-01T00:00:00Z'), documentPurpose: 'TRANSFER_IN' },
      { referenceType: 'GOODS_ISSUE', referenceId: 'gi-1', storageId: 's-1', storageName: 'Kho chính', code: 'PX000001', qty: -1, value: 0, postedAt: new Date('2026-09-01T00:00:00Z'), documentPurpose: null },
    ];
    const totals = [{ total: 3, totalQuantity: 14, totalValue: 3850000 }];
    const base = { page: 1, limit: 20, ...ON_HAND, sort: MobileInventoryVoucherSort.DATE };
    const run = (overrides: Partial<typeof base> & { asOf?: string; search?: string; storageId?: string } = {}) => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce(voucherRows).mockResolvedValueOnce(totals);
      return service.listVouchers({ id: PRODUCT, branchId: BRANCH_A }, { ...base, ...overrides }, actor);
    };

    it('gộp theo (reference_type, reference_id, kho) trong kỳ, bỏ nhóm triệt tiêu, mã qua documentNumberSql', async () => {
      await run({ asOf: '2026-09-11' });

      const sql = sqlAt(1);
      expect(sql).toContain('GROUP BY sle.reference_type, sle.reference_id, st.id, st.name');
      expect(sql).toContain('HAVING SUM(sle.quantity) <> 0');
      expect(sql).toContain('AND sle.posted_at >= $5::date');
      expect(sql).toContain('CASE g.reference_type WHEN');
      expect(sql).toContain("FROM goods_receipts d WHERE d.id = g.reference_id");
      expect(sql).toContain("WHEN 'INITIAL_STOCK' THEN 'Tồn kho ban đầu'");
    });

    it('chiều theo DẤU, số tuyệt đối, đơn vị của item đại diện, id ghép ba phần', async () => {
      const result = await run();

      expect(result.data.slice(0, 3).map((v) => [v.direction, v.quantity, v.value])).toEqual([
        ['inbound', 5, 1750000],
        ['outbound', 6, 2100000],
        ['inbound', 3, 0],
      ]);
      expect(result.data[0].id).toBe('GOODS_RECEIPT:gr-1:s-1');
      expect(result.data[2].id).toBe('INITIAL_STOCK:none:s-2');
      expect(result.data[2].code).toBe('Tồn kho ban đầu');
      expect(result.data[0].unit).toBe('đôi');
      expect(result.data[0].date).toBe('2026-09-04T03:43:44.757Z');
      expect(result).toEqual(expect.objectContaining({ total: 3, page: 1, limit: 20, totalQuantity: 14, totalValue: 3850000 }));
    });

    it('document: phiếu nhập PURCHASE -> goods-receipt, purpose khác -> stock-in, phiếu xuất -> stock-out, còn lại null', async () => {
      const result = await run();

      expect(result.data.map((v) => v.document)).toEqual([
        { kind: 'goods-receipt', id: 'gr-1' },
        null,
        null,
        { kind: 'stock-in', id: 'gr-2' },
        { kind: 'stock-out', id: 'gi-1' },
      ]);
      expect(sqlAt(1)).toContain("WHEN 'GOODS_RECEIPT' THEN (SELECT d.purpose::text FROM goods_receipts d WHERE d.id = g.reference_id)");
      expect(sqlAt(1)).toContain('document_purpose AS "documentPurpose"');
    });

    it('search escape ký tự đại diện, tra trên mã ĐÃ giải và tên kho; storageId thành tham số uuid', async () => {
      await run({ search: ' NK_1 ', storageId: 's-1' });

      expect(paramsAt(1)).toContain('%NK\\_1%');
      expect(sqlAt(1)).toMatch(/\(code ILIKE \$\d+ OR storage_name ILIKE \$\d+\)/);
      expect(sqlAt(1)).toMatch(/storage_id = \$\d+::uuid/);
    });

    it.each([
      [MobileInventoryVoucherSort.DATE, 'ORDER BY posted_at DESC, storage_id ASC, code ASC'],
      [MobileInventoryVoucherSort.QUANTITY_ASC, 'ORDER BY ABS(qty) ASC, posted_at DESC, storage_id ASC, code ASC'],
      [MobileInventoryVoucherSort.QUANTITY_DESC, 'ORDER BY ABS(qty) DESC, posted_at DESC, storage_id ASC, code ASC'],
    ])('sort=%s -> %s', async (sort, expected) => {
      await run({ sort });

      expect(sqlAt(1)).toContain(expected);
    });

    it('câu tổng dùng CÙNG where, không LIMIT, tham số không mang phân trang', async () => {
      await run({ page: 2, limit: 5, storageId: 's-1' });

      expect(sqlAt(1)).toContain('LIMIT $7 OFFSET $8');
      expect(paramsAt(1).slice(-2)).toEqual([5, 5]);
      expect(sqlAt(2)).toMatch(/storage_id = \$6::uuid/);
      expect(sqlAt(2)).not.toContain('LIMIT');
      expect(sqlAt(2)).toContain('SUM(ABS(qty))');
      expect(paramsAt(2)).toEqual(paramsAt(1).slice(0, -2));
    });
  });

  describe('kind pending (đang chuyển / sắp về)', () => {
    it('variants: cells đọc phiếu chuyển, cột kỳ = 0, tham số asOf/monthStart vẫn được tham chiếu', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([]);

      await service.listVariants(PRODUCT, { kind: MobileInventoryKind.INCOMING, asOf: '2026-09-11' }, actor);

      const sql = sqlAt(1);
      expect(sql).toContain('FROM transfer_orders t');
      expect(sql).toContain('t.destination_branch_id = ANY($3::text[])');
      expect(sql).toContain('l.item_id = ANY($4::uuid[])');
      expect(sql).toContain('0::float                                AS opening_qty');
      expect(sql).toContain('$2::text IS NOT NULL');
      expect(sql).toContain('$5::text IS NOT NULL');
      expect(sql).not.toContain('stock_ledger_entries');
    });

    it('flow in_transit: tồn đầu 0, tồn cuối = tổng đang chuyển, MỘT dòng "Phiếu chuyển kho" ở phía XUẤT', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([{ quantity: 3, value: 900000 }]);

      const flow = await service.getFlow(
        { id: PRODUCT, branchId: BRANCH_A },
        { kind: MobileInventoryKind.IN_TRANSIT },
        actor,
      );

      expect(query).toHaveBeenCalledTimes(2);
      expect(sqlAt(1)).toContain('FROM transfer_orders t');
      expect(paramsAt(1)).toEqual(['org-1', expect.any(String), [BRANCH_A], ITEMS.map((i) => i.id)]);
      expect(flow).toEqual({
        storeId: BRANCH_A,
        openingQuantity: 0,
        closingQuantity: 3,
        inbound: { quantity: 0, value: 0, lines: [] },
        outbound: { quantity: 3, value: 900000, lines: [{ name: 'Phiếu chuyển kho', quantity: 3, value: 900000 }] },
      });
    });

    it('flow incoming: dòng nằm ở phía NHẬP; không có phiếu nào thì lines rỗng', async () => {
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([{ quantity: 2, value: 100 }]);
      const flow = await service.getFlow({ id: PRODUCT, branchId: BRANCH_A }, { kind: MobileInventoryKind.INCOMING }, actor);
      expect(flow.inbound.lines).toHaveLength(1);
      expect(flow.outbound.lines).toEqual([]);

      query.mockReset();
      query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([{ quantity: 0, value: 0 }]);
      const none = await service.getFlow({ id: PRODUCT, branchId: BRANCH_A }, { kind: MobileInventoryKind.INCOMING }, actor);
      expect(none.inbound.lines).toEqual([]);
      expect(none.closingQuantity).toBe(0);
    });

    it('vouchers in_transit: một dòng mỗi (phiếu, kho), số ÂM để ra outbound, mã lùi về nhãn, cùng where/order', async () => {
      query
        .mockResolvedValueOnce(ITEMS)
        .mockResolvedValueOnce([
          { referenceType: 'TRANSFER', referenceId: 't-1', storageId: 's-1', storageName: 'Kho chính', code: 'LDC000001', qty: -3, value: -900000, postedAt: new Date('2026-09-03T05:34:07.797Z') },
        ])
        .mockResolvedValueOnce([{ total: 1, totalQuantity: 3, totalValue: 900000 }]);

      const result = await service.listVouchers(
        { id: PRODUCT, branchId: BRANCH_A },
        { page: 1, limit: 20, kind: MobileInventoryKind.IN_TRANSIT, sort: MobileInventoryVoucherSort.DATE, search: 'LDC', storageId: 's-1' },
        actor,
      );

      const sql = sqlAt(1);
      expect(sql).toContain('WITH vouchers AS');
      expect(sql).toContain('-SUM(l.requested_qty)::float');
      expect(sql).toContain("COALESCE(t.document_number, 'Phiếu chuyển kho')");
      expect(sql).toContain('COALESCE(t.exported_at, t.created_at)');
      expect(sql).toContain('GROUP BY t.id, st.id, st.name');
      expect(sql).toMatch(/\(code ILIKE \$\d+ OR storage_name ILIKE \$\d+\)/);
      expect(sql).toContain('ORDER BY posted_at DESC, storage_id ASC, code ASC');
      expect(sql).not.toContain('stock_ledger_entries');
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'TRANSFER:t-1:s-1', direction: 'outbound', quantity: 3, value: 900000, code: 'LDC000001', document: null }),
      );
      expect(sql).toContain('NULL::text                              AS document_purpose');
      expect(result.totalQuantity).toBe(3);
    });

    it('vouchers incoming: số DƯƠNG -> inbound', async () => {
      query
        .mockResolvedValueOnce(ITEMS)
        .mockResolvedValueOnce([
          { referenceType: 'TRANSFER', referenceId: 't-1', storageId: 's-1', storageName: 'Kho chính', code: 'Phiếu chuyển kho', qty: 3, value: 0, postedAt: new Date('2026-09-03T00:00:00Z') },
        ])
        .mockResolvedValueOnce([{ total: 1, totalQuantity: 3, totalValue: 0 }]);

      const result = await service.listVouchers(
        { id: PRODUCT, branchId: BRANCH_A },
        { page: 1, limit: 20, kind: MobileInventoryKind.INCOMING, sort: MobileInventoryVoucherSort.DATE },
        actor,
      );

      expect(sqlAt(1)).not.toContain('-SUM(l.requested_qty)');
      expect(result.data[0].direction).toBe('inbound');
    });
  });

  it('mọi đường dùng CÙNG mảnh phạm vi sổ cái với MobileInventoryService', async () => {
    query.mockResolvedValueOnce(ITEMS).mockResolvedValueOnce([]);
    await service.listVariants(PRODUCT, ON_HAND, actor);
    const variantsSql = sqlAt(1);

    query.mockReset();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0, totalQuantity: 0, totalValue: 0 }]);
    await main.listProducts(
      {
        page: 1,
        limit: 20,
        ...ON_HAND,
        status: MobileInventoryStatus.ALL,
        sort: MobileInventorySort.QUANTITY_DESC,
        level: MobileInventoryLevel.PRODUCT,
      },
      actor,
    );
    const productsSql = query.mock.calls[0][0] as string;

    const marker = 'COALESCE(sb.is_tracked, true) = true';
    expect(variantsSql).toContain(marker);
    expect(productsSql).toContain(marker);
    expect(variantsSql).toContain("gix.status = 'CANCELLED'");
  });
});
