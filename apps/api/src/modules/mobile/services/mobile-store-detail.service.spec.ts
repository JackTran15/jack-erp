import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileInventoryService } from './mobile-inventory.service';
import { MobileStoreDetailService } from './mobile-store-detail.service';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_C = '20000000-0000-4000-8000-000000000003';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  branchIds: [BRANCH_A],
  roles: [],
};

const query = { id: BRANCH_A, from: '2026-09-01', to: '2026-09-30' };

/** Nhận diện từng câu theo dấu vết riêng của nó. */
const isName = (sql: string) => sql.includes('SELECT name FROM branches');
const isRevenue = (sql: string) => sql.includes('AS "paidAmount"');
const isCancelled = (sql: string) => sql.includes(`i.status = 'cancelled'`);
const isSalesPayments = (sql: string) => sql.includes('FROM invoice_payments p');
const isDebtPayments = (sql: string) => sql.includes('FROM debt_payments d');
const isPending = (sql: string) => sql.includes(`i.status IN ('debt', 'partial_debt')`) && !sql.includes('WITH');
const isCustomerItems = (sql: string) => sql.includes('LIMIT $5');
const isCustomerTotals = (sql: string) => sql.includes('COUNT(DISTINCT f.id)');

/**
 * SQL thô nên phần kiểm được không cần Postgres là chính câu lệnh (tách theo
 * trạng thái trên CTE của Tổng quan, dấu RETURN ở thanh toán, lọc org qua
 * `invoices`, câu chờ thanh toán KHÔNG có ngày, trần 20 khách) và phần ghép
 * (map phương thức, 403/404). Cùng giới hạn `mobile-overview-report.service.spec.ts`.
 */
describe('MobileStoreDetailService', () => {
  let service: MobileStoreDetailService;
  let query$: jest.Mock;
  let findStore: jest.Mock;

  beforeEach(async () => {
    query$ = jest.fn().mockImplementation((sql: string) =>
      Promise.resolve(isName(sql) ? [{ name: 'Huế' }] : []),
    );
    findStore = jest.fn().mockResolvedValue({ quantity: 12, stockValue: 3400 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileStoreDetailService,
        { provide: getDataSourceToken(), useValue: { query: query$ } },
        { provide: MobileInventoryService, useValue: { findStore } },
      ],
    }).compile();

    service = module.get(MobileStoreDetailService);
  });

  const callOf = (pick: (sql: string) => boolean) =>
    query$.mock.calls.find(([sql]) => pick(sql as string))!;

  it('doanh thu tách theo trạng thái trên ĐÚNG CTE của Tổng quan (loại huỷ, dấu direction), bind [org, from, to, [id]]', async () => {
    await service.getDetail(query, actor);

    const [sql, params] = callOf(isRevenue);
    expect(sql).toContain(`i.status <> 'cancelled'`);
    expect(sql).toContain('(li.line_total - li.promotion_discount)');
    expect(sql).toContain(`FILTER (WHERE invoice_status = 'paid')`);
    expect(sql).toContain(`FILTER (WHERE invoice_status IN ('debt', 'partial_debt'))`);
    expect(sql).toContain('AND i.branch_id = ANY($4::text[])');
    expect(params).toEqual(['org-1', '2026-09-01', '2026-09-30', [BRANCH_A]]);
  });

  it('thanh toán: dấu −1 cho RETURN, lọc org/chi nhánh/ngày qua `invoices`, không đụng cột uuid của invoice_payments', async () => {
    await service.getDetail(query, actor);

    const [sql] = callOf(isSalesPayments);
    expect(sql).toContain(`CASE WHEN i.type = 'RETURN' THEN -1 ELSE 1 END`);
    expect(sql).toContain('i.organization_id = $1');
    expect(sql).toContain('i.branch_id = ANY($4::text[])');
    expect(sql).not.toContain('p.organization_id');
    expect(sql).not.toContain('p.branch_id');

    const [debtSql] = callOf(isDebtPayments);
    expect(debtSql).toContain('d.paid_at >= $2::date');
  });

  it('hoá đơn còn nợ là trạng thái HIỆN TẠI: không mệnh đề ngày, tham số riêng [org, [id]]', async () => {
    await service.getDetail(query, actor);

    const [sql, params] = callOf(isPending);
    expect(sql).not.toContain('issued_at');
    expect(params).toEqual(['org-1', [BRANCH_A]]);
  });

  it('khách mới: tạo tại cửa hàng trong kỳ, bỏ MERGED, trần 20 dòng; tổng đếm DISTINCT trên toàn tập', async () => {
    await service.getDetail(query, actor);

    const [itemsSql, itemsParams] = callOf(isCustomerItems);
    expect(itemsSql).toContain(`c.status <> 'MERGED'`);
    expect(itemsSql).toContain('c.created_at >= $2::date');
    expect(itemsSql).toContain('c.branch_id = ANY($4::text[])');
    expect(itemsSql).toContain('ORDER BY f.created_at DESC');
    expect(itemsParams[4]).toBe(20);

    const [totalsSql] = callOf(isCustomerTotals);
    expect(totalsSql).not.toContain('LIMIT');
  });

  it('tồn kho uỷ quyền findStore với đúng chi nhánh, kind on_hand', async () => {
    const result = await service.getDetail(query, actor);

    expect(findStore).toHaveBeenCalledWith(BRANCH_A, { kind: 'on_hand' }, actor);
    expect(result.inventory).toEqual({ quantity: 12, stockValue: 3400 });
  });

  it('ghép: phương thức map về ba ô, giá trị lạ bị bỏ; số về đúng chỗ', async () => {
    query$.mockImplementation((sql: string) => {
      if (isName(sql)) return Promise.resolve([{ name: 'Huế' }]);
      if (isRevenue(sql)) {
        return Promise.resolve([
          { total: '100.5', paidAmount: 90, paidCount: 3, unpaidAmount: 10.5, unpaidCount: 1, invoiceCount: 4 },
        ]);
      }
      if (isCancelled(sql)) return Promise.resolve([{ count: 2 }]);
      if (isSalesPayments(sql)) {
        return Promise.resolve([
          { method: 'cash', amount: 70 },
          { method: 'bank_transfer', amount: 20 },
          { method: 'crypto', amount: 999 },
        ]);
      }
      if (isDebtPayments(sql)) return Promise.resolve([{ method: 'card', amount: 5 }]);
      if (isPending(sql)) return Promise.resolve([{ count: 7 }]);
      if (isCustomerItems(sql)) {
        return Promise.resolve([{ id: 'c-1', code: null, name: 'A', createdAt: new Date('2026-09-02'), amount: '12' }]);
      }
      if (isCustomerTotals(sql)) return Promise.resolve([{ count: 3, totalAmount: 30 }]);
      return Promise.resolve([]);
    });

    const result = await service.getDetail(query, actor);

    expect(result.name).toBe('Huế');
    expect(result.revenue).toEqual({
      total: 100.5, paidAmount: 90, paidCount: 3, unpaidAmount: 10.5, unpaidCount: 1, cancelledCount: 2, invoiceCount: 4,
    });
    expect(result.collected).toEqual({
      sales: { cash: 70, card: 0, transfer: 20 },
      debt: { cash: 0, card: 5, transfer: 0 },
    });
    expect(result.pendingUnpaidCount).toBe(7);
    expect(result.newCustomers.count).toBe(3);
    expect(result.newCustomers.totalAmount).toBe(30);
    expect(result.newCustomers.items).toEqual([
      { id: 'c-1', code: null, name: 'A', createdAt: new Date('2026-09-02'), amount: 12 },
    ]);
  });

  it('chi nhánh ngoài phân công → 403 trước khi chạm database; không có tên → 404', async () => {
    await expect(service.getDetail({ ...query, id: BRANCH_C }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query$).not.toHaveBeenCalled();

    query$.mockResolvedValue([]);
    await expect(service.getDetail(query, actor)).rejects.toBeInstanceOf(NotFoundException);
  });
});
