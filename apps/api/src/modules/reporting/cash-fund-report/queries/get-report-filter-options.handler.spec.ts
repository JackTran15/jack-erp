import { BadRequestException } from '@nestjs/common';
import { CASH_CONSOLIDATED } from '../report-definition';
import { CashFundFilterOptionType } from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsHandler, voucherStaffSql } from './get-report-filter-options.handler';

const ASSIGNED = ['b1', 'b2'];
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'b1',
  roles: [],
  branchIds: ASSIGNED,
} as any;

/**
 * QueryBuilder stub that records what it was told, so the join subquery and
 * the raw predicates can be asserted on. `raw` feeds getRawMany.
 */
function qbStub(raw: any[] = []) {
  const qb: any = {
    joins: [] as Array<[string, string, string]>,
    whereCalls: [] as Array<[string, any]>,
    andWhereCalls: [] as Array<[string, any]>,
  };
  for (const m of ['select', 'addSelect', 'orderBy', 'addOrderBy', 'offset', 'limit']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.innerJoin = jest.fn((target: any, alias: string, condition: string) => {
    qb.joins.push([typeof target === 'string' ? target : target.name, alias, condition]);
    return qb;
  });
  qb.where = jest.fn((sql: string, params?: any) => {
    qb.whereCalls.push([sql, params]);
    return qb;
  });
  qb.andWhere = jest.fn((sql: string, params?: any) => {
    qb.andWhereCalls.push([sql, params]);
    return qb;
  });
  qb.getRawMany = jest.fn(async () => raw);
  return qb;
}

const STAFF_ROWS = [
  { userId: 'usr-1', code: 'NV000002', firstName: 'Thu', lastName: 'Nguyễn' },
  { userId: 'usr-2', code: 'NV000005', firstName: undefined, lastName: undefined },
];

function makeHandler(opts: { consolidated?: boolean; raw?: any[] } = {}) {
  const branches = { find: jest.fn(async () => [{ id: 'b1', name: 'Cần Thơ' }]) };
  const employeeQb = qbStub(opts.raw ?? STAFF_ROWS);
  const employees = { createQueryBuilder: jest.fn(() => employeeQb) };
  const hasPermission = jest.fn(async () => opts.consolidated ?? false);
  const handler = new GetReportFilterOptionsHandler(
    branches as any,
    employees as any,
    { hasPermission } as any,
  );
  return { handler, branches, employees, employeeQb, hasPermission };
}

const run = (handler: GetReportFilterOptionsHandler, dto: any, who = actor) =>
  handler.execute({ dto, actor: who } as any);

/** The subquery string the employee query was joined to. */
const staffSubquery = (qb: any): string =>
  (qb.joins as Array<[string, string, string]>).find(([, alias]) => alias === 's')![0];

describe('GetReportFilterOptionsHandler (cash)', () => {
  describe('employee', () => {
    it('lists only staff recorded on a voucher: joins users to the DISTINCT staff of the 4 voucher tables', async () => {
      const { handler, employeeQb, employees } = makeHandler({ consolidated: true });
      const out = await run(handler, { type: CashFundFilterOptionType.EMPLOYEE });

      expect(employees.createQueryBuilder).toHaveBeenCalledWith('e');
      const sub = staffSubquery(employeeQb);
      for (const table of ['cash_receipts', 'cash_payments', 'bank_receipts', 'bank_payments']) {
        expect(sub).toContain(`FROM ${table} WHERE organization_id = :org AND deleted_at IS NULL`);
      }
      // Bank vouchers keep the user id in collected_by / paid_by, not staff_id.
      expect(sub).toContain('SELECT collected_by::text AS staff_id FROM bank_receipts');
      expect(sub).toContain('SELECT paid_by::text AS staff_id FROM bank_payments');
      expect(sub.match(/ UNION /g)).toHaveLength(3);
      expect(sub).not.toContain('UNION ALL');
      expect(employeeQb.joins).toContainEqual([expect.stringContaining('SELECT'), 's', 's.staff_id = u.id::text']);
      // The join is inner on both sides — a profile with no voucher never surfaces.
      expect(employeeQb.innerJoin).toHaveBeenCalledTimes(2);
      expect(employeeQb.whereCalls).toEqual([['e.organizationId = :org', { org: 'org-1' }]]);

      expect(out).toEqual([
        { value: 'usr-1', label: 'NV000002 - Thu Nguyễn', metadata: { name: 'Thu Nguyễn' } },
        { value: 'usr-2', label: 'NV000005', metadata: { name: 'NV000005' } },
      ]);
    });

    it('consolidated reader: no branch predicate in the voucher subquery', async () => {
      const { handler, employeeQb, hasPermission } = makeHandler({ consolidated: true });
      await run(handler, { type: CashFundFilterOptionType.EMPLOYEE });
      expect(hasPermission).toHaveBeenCalledWith('u1', 'org-1', CASH_CONSOLIDATED);
      expect(staffSubquery(employeeQb)).not.toContain('branch_id');
      expect(employeeQb.whereCalls[0][1]).not.toHaveProperty('branchIds');
    });

    it('assigned-only reader: every voucher table is bound to the assigned branches', async () => {
      const { handler, employeeQb } = makeHandler({ consolidated: false });
      await run(handler, { type: CashFundFilterOptionType.EMPLOYEE });
      const sub = staffSubquery(employeeQb);
      expect(sub.match(/branch_id = ANY\(:branchIds\)/g)).toHaveLength(4);
      expect(employeeQb.whereCalls).toEqual([
        ['e.organizationId = :org', { org: 'org-1', branchIds: ASSIGNED }],
      ]);
    });

    it('assigned-only reader with no branch: empty without querying', async () => {
      const { handler, employees } = makeHandler({ consolidated: false });
      const out = await run(
        handler,
        { type: CashFundFilterOptionType.EMPLOYEE },
        { ...actor, branchIds: [] },
      );
      expect(out).toEqual([]);
      expect(employees.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('search: ILIKE over first/last name and employee code', async () => {
      const { handler, employeeQb } = makeHandler();
      await run(handler, { type: CashFundFilterOptionType.EMPLOYEE, search: 'thu' });
      expect(employeeQb.andWhereCalls).toContainEqual([
        '(u.firstName ILIKE :s OR u.lastName ILIKE :s OR e.code ILIKE :s)',
        { s: '%thu%' },
      ]);
    });

    it('no search: no ILIKE predicate', async () => {
      const { handler, employeeQb } = makeHandler();
      await run(handler, { type: CashFundFilterOptionType.EMPLOYEE });
      expect(employeeQb.andWhere).not.toHaveBeenCalled();
    });

    it('pages with the dto page/pageSize, ordered by name', async () => {
      const { handler, employeeQb } = makeHandler();
      await run(handler, { type: CashFundFilterOptionType.EMPLOYEE, page: 3, pageSize: 10 });
      expect(employeeQb.orderBy).toHaveBeenCalledWith('u.lastName', 'ASC');
      expect(employeeQb.addOrderBy).toHaveBeenCalledWith('u.firstName', 'ASC');
      expect(employeeQb.offset).toHaveBeenCalledWith(20);
      expect(employeeQb.limit).toHaveBeenCalledWith(10);
    });
  });

  it('voucherStaffSql: drops NULL staff so the join never matches a blank id', () => {
    const sql = voucherStaffSql(true);
    expect(sql).toContain('staff_id IS NOT NULL');
    expect(sql).toContain('collected_by IS NOT NULL');
    expect(sql).toContain('paid_by IS NOT NULL');
  });

  it('paymentMethod: exactly the two funds, no lookup', async () => {
    const { handler, hasPermission, employees } = makeHandler();
    const out = await run(handler, { type: CashFundFilterOptionType.PAYMENT_METHOD });
    expect(out).toEqual([
      { value: 'cash', label: 'Tiền mặt' },
      { value: 'deposit', label: 'Chuyển khoản' },
    ]);
    expect(hasPermission).not.toHaveBeenCalled();
    expect(employees.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('store: consolidated reader sees every branch of the org; assigned reader only theirs', async () => {
    const consolidated = makeHandler({ consolidated: true });
    await run(consolidated.handler, { type: CashFundFilterOptionType.STORE });
    expect((consolidated.branches.find as jest.Mock).mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
    });

    const assigned = makeHandler({ consolidated: false });
    const out = await run(assigned.handler, { type: CashFundFilterOptionType.STORE });
    expect((assigned.branches.find as jest.Mock).mock.calls[0][0].where.id).toBeDefined();
    expect(out).toEqual([{ value: 'b1', label: 'Cần Thơ', metadata: { branchId: 'b1' } }]);
  });

  it('expenseCategory: still 400 until UOW-03 wires it', async () => {
    const { handler } = makeHandler();
    await expect(
      run(handler, { type: CashFundFilterOptionType.EXPENSE_CATEGORY }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unknown type: 400', async () => {
    const { handler } = makeHandler();
    await expect(run(handler, { type: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
