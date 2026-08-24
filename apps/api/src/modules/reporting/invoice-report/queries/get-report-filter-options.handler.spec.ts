import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportFilterOptionType } from '@erp/shared-interfaces';
import { EmployeeScope } from '../../../rbac/employee-branch-scope.service';
import { GetReportFilterOptionsHandler } from './get-report-filter-options.handler';

const BRANCH = 'b1';
const actor = { userId: 'u1', organizationId: 'org-1', branchId: BRANCH, roles: [] } as any;

/**
 * QueryBuilder stub that records what it was told, so a raw-SQL predicate can
 * be asserted on. `rows` feeds getMany, `raw` feeds getRawMany.
 */
function qbStub(result: { rows?: any[]; raw?: any[] } = {}) {
  const qb: any = { andWhereCalls: [] as Array<[string, any]> };
  for (const m of [
    'innerJoin', 'leftJoin', 'where', 'select', 'addSelect',
    'orderBy', 'addOrderBy', 'offset', 'limit', 'skip', 'take',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.andWhere = jest.fn((sql: string, params?: any) => {
    qb.andWhereCalls.push([sql, params]);
    return qb;
  });
  qb.getMany = jest.fn(async () => result.rows ?? []);
  qb.getRawMany = jest.fn(async () => result.raw ?? []);
  return qb;
}

/** The (sql, params) pairs mentioning the branch-assignment table. */
const scopeCalls = (qb: any) =>
  (qb.andWhereCalls as Array<[string, any]>).filter(([sql]) =>
    sql.includes('user_branch_assignments'),
  );

function makeHandler(
  overrides: Record<string, any> = {},
  scope: EmployeeScope = { mode: 'branch', branchId: BRANCH },
) {
  const branches = {
    find: jest.fn(async () => [{ id: 'b1', name: 'Cần Thơ' }]),
  };
  const userQb = qbStub({
    rows: [{ id: 'usr-1', firstName: 'Thu', lastName: 'Nguyễn', email: 'thu@x.vn' }],
  });
  const users = { createQueryBuilder: jest.fn(() => userQb) };
  const employees = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(async () => []),
  };
  const customers = {
    find: jest.fn(async () => [{ id: 'cus-1', name: 'Khách lẻ', phone: '0900' }]),
  };
  const categories = {
    find: jest.fn(async () => [{ id: 'cat-1', name: 'Đồ uống' }]),
  };
  const items = { createQueryBuilder: jest.fn() };
  const repos = { branches, users, employees, customers, categories, items, ...overrides };
  const resolve = jest.fn(async () => scope);
  const handler = new GetReportFilterOptionsHandler(
    repos.branches as any,
    repos.users as any,
    repos.employees as any,
    repos.customers as any,
    repos.categories as any,
    repos.items as any,
    { resolve } as any,
  );
  return { handler, repos, userQb, resolve };
}

const run = (handler: GetReportFilterOptionsHandler, dto: any) =>
  handler.execute({ dto, actor } as any);

describe('GetReportFilterOptionsHandler', () => {
  it('store: maps branches to options with metadata.branchId, org-scoped', async () => {
    const { handler, repos } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.STORE });
    expect(out).toEqual([
      { value: 'b1', label: 'Cần Thơ', metadata: { branchId: 'b1' } },
    ]);
    expect((repos.branches.find as jest.Mock).mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('cashier: label is "First Last", filtered by org + active', async () => {
    const { handler, userQb } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.CASHIER });
    expect(out).toEqual([
      { value: 'usr-1', label: 'Thu Nguyễn', metadata: { name: 'Thu Nguyễn' } },
    ]);
    expect(userQb.where).toHaveBeenCalledWith('u.organizationId = :org', {
      org: 'org-1',
    });
    expect(userQb.andWhereCalls.map(([sql]: [string, any]) => sql)).toContain(
      'u.isActive = true',
    );
  });

  it('cashier: keeps the ordering and paging the find() used', async () => {
    const { handler, userQb } = makeHandler();
    await run(handler, { type: ReportFilterOptionType.CASHIER, page: 3, pageSize: 10 });
    expect(userQb.orderBy).toHaveBeenCalledWith('u.lastName', 'ASC');
    expect(userQb.addOrderBy).toHaveBeenCalledWith('u.firstName', 'ASC');
    expect(userQb.skip).toHaveBeenCalledWith(20);
    expect(userQb.take).toHaveBeenCalledWith(10);
  });

  it('cashier: label is "{code} - First Last" when an employee profile is linked', async () => {
    const { handler, repos } = makeHandler({
      employees: {
        createQueryBuilder: jest.fn(),
        find: jest.fn(async () => [{ userId: 'usr-1', code: 'NV000002' }]),
      },
    });
    const out = await run(handler, { type: ReportFilterOptionType.CASHIER });
    expect(out).toEqual([
      {
        value: 'usr-1',
        label: 'NV000002 - Thu Nguyễn',
        metadata: { name: 'Thu Nguyễn' },
      },
    ]);
  });

  it('cashier: label is the bare email when the user has no name on file', async () => {
    const nameless = qbStub({ rows: [{ id: 'usr-9', email: 'thu@x.vn' }] });
    const { handler } = makeHandler({
      users: { createQueryBuilder: jest.fn(() => nameless) },
    });
    const out = await run(handler, { type: ReportFilterOptionType.CASHIER });
    expect(out).toEqual([
      { value: 'usr-9', label: 'thu@x.vn', metadata: { name: 'thu@x.vn' } },
    ]);
  });

  it('cashier: search builds an OR over first/last name', async () => {
    const { handler, userQb } = makeHandler();
    await run(handler, { type: ReportFilterOptionType.CASHIER, search: 'thu' });
    expect(userQb.andWhereCalls).toContainEqual([
      '(u.firstName ILIKE :s OR u.lastName ILIKE :s)',
      { s: '%thu%' },
    ]);
  });

  it('salesperson: label is "{code} - First Last"', async () => {
    const rows = [
      { id: 'emp-1', code: 'NV000003', firstName: 'An', lastName: 'Trần' },
    ];
    const qb = qbStub({ raw: rows });
    const { handler } = makeHandler({
      employees: { createQueryBuilder: jest.fn(() => qb), find: jest.fn(async () => []) },
    });
    const out = await run(handler, { type: ReportFilterOptionType.SALESPERSON });
    expect(out).toEqual([
      {
        value: 'emp-1',
        label: 'NV000003 - An Trần',
        metadata: { name: 'An Trần' },
      },
    ]);
  });

  it('customer: search matches name or phone', async () => {
    const { handler, repos } = makeHandler();
    const out = await run(handler, {
      type: ReportFilterOptionType.CUSTOMER,
      search: 'le',
    });
    expect(out[0]).toEqual({
      value: 'cus-1',
      label: 'Khách lẻ',
      metadata: { phone: '0900' },
    });
    expect((repos.customers.find as jest.Mock).mock.calls[0][0].where).toHaveLength(2);
  });

  it('invoiceStatus: returns the static enum table (real backend statuses)', async () => {
    const { handler } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.INVOICE_STATUS });
    expect(out).toEqual([
      { value: 'draft', label: 'Lưu tạm' },
      { value: 'pending', label: 'Chờ xử lý' },
      { value: 'paid', label: 'Hoàn thành' },
      { value: 'debt', label: 'Công nợ' },
      { value: 'partial_debt', label: 'Nợ một phần' },
      { value: 'cancelled', label: 'Đã hủy' },
    ]);
  });

  it('statBy: returns item | parent | group (reconciled grain)', async () => {
    const { handler } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.STAT_BY });
    expect(out.map((o) => o.value)).toEqual(['item', 'parent', 'group']);
  });

  it('unknown type throws 400', async () => {
    const { handler } = makeHandler();
    await expect(run(handler, { type: 'bogus' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('branch scope (AC-08, AC-09)', () => {
    it('cashier: binds the active branch into the user query', async () => {
      const { handler, userQb } = makeHandler();
      await run(handler, { type: ReportFilterOptionType.CASHIER });
      expect(scopeCalls(userQb)).toEqual([
        [expect.stringContaining('uba.user_id = u.id'), { scopeBranchId: BRANCH }],
      ]);
    });

    // AC-09 and the trap it guards: user_branch_assignments.user_id points at
    // users.id. Keyed on e.id the predicate matches nothing and the screen shows
    // an empty dropdown, which reads as missing data rather than a bug.
    it('salesperson: keys the predicate on u.id, never on the profile id', async () => {
      const qb = qbStub({ raw: [] });
      const { handler } = makeHandler({
        employees: { createQueryBuilder: jest.fn(() => qb), find: jest.fn(async () => []) },
      });
      await run(handler, { type: ReportFilterOptionType.SALESPERSON });
      const [[sql, params]] = scopeCalls(qb);
      expect(sql).toContain('uba.user_id = u.id');
      expect(sql).not.toContain('uba.user_id = e.id');
      expect(params).toEqual({ scopeBranchId: BRANCH });
    });

    it('adds no predicate for either type when the scope is all', async () => {
      const salesQb = qbStub({ raw: [] });
      const { handler, userQb } = makeHandler(
        { employees: { createQueryBuilder: jest.fn(() => salesQb), find: jest.fn(async () => []) } },
        { mode: 'all' },
      );
      await run(handler, { type: ReportFilterOptionType.CASHIER });
      await run(handler, { type: ReportFilterOptionType.SALESPERSON });
      expect(scopeCalls(userQb)).toEqual([]);
      expect(scopeCalls(salesQb)).toEqual([]);
    });

    /**
     * The explicit-branchId mode (AC-08, AC-09, AC-10, AC-11). Every case here
     * runs with `mode: 'all'` — an actor holding `iam.user.read.all` — because
     * that is the actor the whole parameter exists for: everyone else is already
     * narrowed by EmployeeBranchScopeService and cannot tell the two modes apart.
     */
    describe('explicit branchId', () => {
      const OTHER = 'b2';
      const chainActor = {
        userId: 'u1',
        organizationId: 'org-1',
        branchId: BRANCH,
        branchIds: [BRANCH, OTHER],
        roles: [],
      } as any;
      const runAs = (handler: any, dto: any, who = chainActor) =>
        handler.execute({ dto, actor: who });

      const withSalesQb = () => {
        const salesQb = qbStub({ raw: [] });
        const { handler, userQb, repos } = makeHandler(
          {
            employees: {
              createQueryBuilder: jest.fn(() => salesQb),
              find: jest.fn(async () => []),
            },
          },
          { mode: 'all' },
        );
        return { handler, userQb, salesQb, repos };
      };

      it('cashier: pins to the named branch despite iam.user.read.all', async () => {
        const { handler, userQb } = withSalesQb();
        await runAs(handler, {
          type: ReportFilterOptionType.CASHIER,
          branchId: OTHER,
        });
        expect(scopeCalls(userQb)).toEqual([
          [
            expect.stringContaining('uba.user_id = u.id'),
            { scopeBranchId: OTHER },
          ],
        ]);
      });

      it('salesperson: pins to the named branch despite iam.user.read.all', async () => {
        const { handler, salesQb } = withSalesQb();
        await runAs(handler, {
          type: ReportFilterOptionType.SALESPERSON,
          branchId: OTHER,
        });
        const [[sql, params]] = scopeCalls(salesQb);
        expect(sql).toContain('uba.user_id = u.id');
        expect(params).toEqual({ scopeBranchId: OTHER });
      });

      // AC-10. Without this check the parameter is a way for any actor to read
      // the staff of a branch they were never assigned to.
      it('403s for a branch outside the token, for both types', async () => {
        for (const type of [
          ReportFilterOptionType.CASHIER,
          ReportFilterOptionType.SALESPERSON,
        ]) {
          const { handler, userQb, salesQb } = withSalesQb();
          await expect(
            runAs(handler, { type, branchId: 'b-not-mine' }),
          ).rejects.toBeInstanceOf(ForbiddenException);
          expect(scopeCalls(userQb)).toEqual([]);
          expect(scopeCalls(salesQb)).toEqual([]);
        }
      });

      it('403s when the token carries no branchIds at all', async () => {
        const { handler } = withSalesQb();
        await expect(
          runAs(
            handler,
            { type: ReportFilterOptionType.CASHIER, branchId: BRANCH },
            actor, // the shared actor has branchId but no branchIds
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      // AC-11: the backoffice chain report sends no branchId, and must keep the
      // consolidated list. This is the case that forbids narrowing the shared
      // scope service instead of adding the parameter.
      it('omitting branchId leaves the consolidated scope untouched', async () => {
        const { handler, userQb, salesQb } = withSalesQb();
        await runAs(handler, { type: ReportFilterOptionType.CASHIER });
        await runAs(handler, { type: ReportFilterOptionType.SALESPERSON });
        expect(scopeCalls(userQb)).toEqual([]);
        expect(scopeCalls(salesQb)).toEqual([]);
      });

      it('does not touch the types that list no people', async () => {
        const { handler, repos } = withSalesQb();
        await expect(
          runAs(handler, {
            type: ReportFilterOptionType.STORE,
            branchId: 'b-not-mine',
          }),
        ).resolves.toHaveLength(1);
        expect(repos.branches.find).toHaveBeenCalled();
      });
    });

    it('returns nothing without querying when the scope is none', async () => {
      const salesQb = qbStub({ raw: [{ id: 'emp-1', code: 'NV1' }] });
      const { handler, repos } = makeHandler(
        { employees: { createQueryBuilder: jest.fn(() => salesQb), find: jest.fn(async () => []) } },
        { mode: 'none' },
      );
      await expect(run(handler, { type: ReportFilterOptionType.CASHIER })).resolves.toEqual([]);
      await expect(run(handler, { type: ReportFilterOptionType.SALESPERSON })).resolves.toEqual([]);
      expect(repos.users.createQueryBuilder).not.toHaveBeenCalled();
      expect(repos.employees.createQueryBuilder).not.toHaveBeenCalled();
    });

    // The other filter types must not pay for a permission lookup they never read.
    it('resolves the scope only for the two employee-listing types', async () => {
      const { handler, resolve } = makeHandler();
      await run(handler, { type: ReportFilterOptionType.STORE });
      await run(handler, { type: ReportFilterOptionType.CUSTOMER });
      await run(handler, { type: ReportFilterOptionType.INVOICE_STATUS });
      expect(resolve).not.toHaveBeenCalled();

      await run(handler, { type: ReportFilterOptionType.CASHIER });
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    // AC-09 second half — the untouched types keep working exactly as before.
    it('leaves the non-employee filter types unscoped', async () => {
      const { handler, repos } = makeHandler();
      const store = await run(handler, { type: ReportFilterOptionType.STORE });
      const customer = await run(handler, { type: ReportFilterOptionType.CUSTOMER });
      const group = await run(handler, { type: ReportFilterOptionType.PRODUCT_GROUP });

      expect(store).toEqual([
        { value: 'b1', label: 'Cần Thơ', metadata: { branchId: 'b1' } },
      ]);
      expect(customer).toEqual([
        { value: 'cus-1', label: 'Khách lẻ', metadata: { phone: '0900' } },
      ]);
      expect(group).toEqual([{ value: 'cat-1', label: 'Đồ uống' }]);
      for (const repo of [repos.branches, repos.customers, repos.categories]) {
        const where = (repo.find as jest.Mock).mock.calls[0][0].where;
        expect(JSON.stringify(where)).not.toContain('branch');
      }
    });
  });
});
