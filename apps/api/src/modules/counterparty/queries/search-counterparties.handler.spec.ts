import { CounterpartyKind } from '../dto/search-counterparties.dto';
import { EmployeeScope } from '../../rbac/employee-branch-scope.service';
import { SearchCounterpartiesHandler } from './search-counterparties.handler';
import { SearchCounterpartiesQuery } from './search-counterparties.query';

const BRANCH_HN = 'branch-hn';
const actor = {
  organizationId: 'org1',
  userId: 'u1',
  branchId: BRANCH_HN,
  roles: [],
} as never;

function qb(result: { manyAndCount?: unknown; rawMany?: unknown; count?: number }) {
  const self: Record<string, unknown> = {};
  for (const m of [
    'where', 'orderBy', 'addOrderBy', 'leftJoin',
    'select', 'addSelect', 'skip', 'take', 'offset', 'limit',
  ]) {
    self[m] = () => self;
  }
  // Recorded rather than ignored: the branch predicate is a raw SQL string, so
  // the only way to assert it landed is to look at what andWhere received.
  const andWhereCalls: Array<[string, Record<string, unknown> | undefined]> = [];
  self.andWhere = (sql: string, params?: Record<string, unknown>) => {
    andWhereCalls.push([sql, params]);
    return self;
  };
  self.andWhereCalls = andWhereCalls;
  self.getManyAndCount = async () => result.manyAndCount;
  self.getRawMany = async () => result.rawMany;
  self.getCount = async () => result.count;
  return self;
}

function makeHandler(opts: {
  suppliers: { rows: unknown[]; total: number };
  customers: { rows: unknown[]; total: number };
  employees: { rows: unknown[]; count: number };
  scope?: EmployeeScope;
}): {
  handler: SearchCounterpartiesHandler;
  resolve: jest.Mock;
  userQbs: Array<Record<string, unknown>>;
} {
  const providerRepo = {
    createQueryBuilder: () =>
      qb({ manyAndCount: [opts.suppliers.rows, opts.suppliers.total] }),
  };
  const customerRepo = {
    createQueryBuilder: () =>
      qb({ manyAndCount: [opts.customers.rows, opts.customers.total] }),
  };
  const userQbs: Array<Record<string, unknown>> = [];
  const userRepo = {
    createQueryBuilder: () => {
      const built = qb({
        rawMany: opts.employees.rows,
        count: opts.employees.count,
      });
      userQbs.push(built);
      return built;
    },
  };
  const resolve = jest
    .fn()
    .mockResolvedValue(
      opts.scope ?? { mode: 'branch', branchId: BRANCH_HN },
    );
  const handler = new SearchCounterpartiesHandler(
    providerRepo as never,
    customerRepo as never,
    userRepo as never,
    { resolve } as never,
  );
  return { handler, resolve, userQbs };
}

/** Every (sql, params) pair the employee query builders received. */
function employeePredicates(
  userQbs: Array<Record<string, unknown>>,
): Array<[string, Record<string, unknown> | undefined]> {
  return userQbs.flatMap(
    (b) => b.andWhereCalls as Array<[string, Record<string, unknown> | undefined]>,
  );
}

describe('SearchCounterpartiesHandler', () => {
  it('returns only suppliers for type=supplier and maps address from notes', async () => {
    const { handler } = makeHandler({
      suppliers: {
        rows: [{ id: 's1', code: 'NCC1', name: 'Beta', phone: '1', notes: 'note-addr' }],
        total: 1,
      },
      customers: { rows: [], total: 0 },
      employees: { rows: [], count: 0 },
    });

    const res = await handler.execute(
      new SearchCounterpartiesQuery(
        { type: CounterpartyKind.SUPPLIER, page: 1, pageSize: 20 },
        actor,
      ),
    );

    expect(res.total).toBe(1);
    expect(res.data).toEqual([
      { kind: 'supplier', id: 's1', code: 'NCC1', name: 'Beta', phone: '1', address: 'note-addr' },
    ]);
  });

  it('merges all three kinds sorted by name with summed total', async () => {
    const { handler } = makeHandler({
      suppliers: { rows: [{ id: 's1', code: 'NCC1', name: 'Beta', phone: '1' }], total: 1 },
      customers: { rows: [{ id: 'c1', code: 'KH1', name: 'Alpha', phone: '2', address: 'a' }], total: 1 },
      employees: {
        rows: [{ id: 'e1', firstName: 'Zoe', lastName: 'Z', code: 'NV1', mobile: '3' }],
        count: 1,
      },
    });

    const res = await handler.execute(
      new SearchCounterpartiesQuery(
        { type: CounterpartyKind.ALL, page: 1, pageSize: 20 },
        actor,
      ),
    );

    expect(res.total).toBe(3);
    expect(res.data.map((d) => d.name)).toEqual(['Alpha', 'Beta', 'Zoe Z']);
    expect(res.data.map((d) => d.kind)).toEqual(['customer', 'supplier', 'employee']);
    expect(res.data[2]).toMatchObject({ id: 'e1', code: 'NV1', phone: '3' });
  });

  it('merges only the requested kinds when `types` is given', async () => {
    const { handler } = makeHandler({
      suppliers: { rows: [{ id: 's1', code: 'NCC1', name: 'Beta', phone: '1' }], total: 1 },
      customers: { rows: [{ id: 'c1', code: 'KH1', name: 'Alpha', phone: '2', address: 'a' }], total: 1 },
      employees: {
        rows: [{ id: 'e1', firstName: 'Zoe', lastName: 'Z', code: 'NV1', mobile: '3' }],
        count: 1,
      },
    });

    const res = await handler.execute(
      new SearchCounterpartiesQuery(
        {
          type: CounterpartyKind.ALL,
          types: [CounterpartyKind.SUPPLIER, CounterpartyKind.EMPLOYEE],
          page: 1,
          pageSize: 20,
        },
        actor,
      ),
    );

    // Customers are excluded even though the repo would return one.
    expect(res.total).toBe(2);
    expect(res.data.map((d) => d.kind)).toEqual(['supplier', 'employee']);
  });

  it('takes the single-kind path when `types` holds one kind', async () => {
    const { handler } = makeHandler({
      suppliers: { rows: [], total: 0 },
      customers: { rows: [], total: 0 },
      employees: {
        rows: [{ id: 'e1', firstName: 'Zoe', lastName: 'Z', code: 'NV1', mobile: '3' }],
        count: 5,
      },
    });

    const res = await handler.execute(
      new SearchCounterpartiesQuery(
        {
          type: CounterpartyKind.ALL,
          types: [CounterpartyKind.EMPLOYEE],
          page: 1,
          pageSize: 20,
        },
        actor,
      ),
    );

    // Single kind → the kind's own total (not a merged sum), so paging works.
    expect(res.total).toBe(5);
    expect(res.data.map((d) => d.kind)).toEqual(['employee']);
  });

  describe('branch scope (AC-01..AC-04)', () => {
    const oneEmployee = {
      rows: [{ id: 'e1', firstName: 'Nhân viên', lastName: 'HN', code: 'NV1', mobile: '3' }],
      count: 1,
    };
    const noParties = { rows: [], total: 0 };

    // AC-01 — the predicate must reach the employee query, bound to the active
    // branch. Asserting on the row count alone would pass even with no filter.
    it('binds the active branch into the employee query', async () => {
      const { handler, userQbs } = makeHandler({
        suppliers: noParties,
        customers: noParties,
        employees: oneEmployee,
      });

      await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.EMPLOYEE, page: 1, pageSize: 20 },
          actor,
        ),
      );

      const scoped = employeePredicates(userQbs).filter(([sql]) =>
        sql.includes('user_branch_assignments'),
      );
      expect(scoped.length).toBeGreaterThan(0);
      for (const [sql, params] of scoped) {
        expect(sql).toContain('uba.user_id = u.id');
        expect(params).toEqual({ scopeBranchId: BRANCH_HN });
      }
    });

    // AC-02 — the branch predicate and the search term must AND together. If the
    // scope were applied outside baseWhere, a search would escape it.
    it('applies the branch predicate on the same builder as the search term', async () => {
      const { handler, userQbs } = makeHandler({
        suppliers: noParties,
        customers: noParties,
        employees: { rows: [], count: 0 },
      });

      const res = await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.EMPLOYEE, search: 'HCM', page: 1, pageSize: 20 },
          actor,
        ),
      );

      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
      for (const built of userQbs) {
        const calls = built.andWhereCalls as Array<[string, unknown]>;
        expect(calls.some(([sql]) => sql.includes('user_branch_assignments'))).toBe(true);
        expect(calls.some(([sql]) => sql.includes('ILIKE :like'))).toBe(true);
      }
    });

    // AC-02 again, from the other side: the row query and the count query are
    // both built through baseWhere, so both must carry the predicate. This is
    // what keeps `total` honest.
    it('narrows the count query too, not just the row query', async () => {
      const { handler, userQbs } = makeHandler({
        suppliers: noParties,
        customers: noParties,
        employees: oneEmployee,
      });

      await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.EMPLOYEE, page: 1, pageSize: 20 },
          actor,
        ),
      );

      expect(userQbs).toHaveLength(2);
      for (const built of userQbs) {
        const calls = built.andWhereCalls as Array<[string, unknown]>;
        expect(calls.some(([sql]) => sql.includes('user_branch_assignments'))).toBe(true);
      }
    });

    // AC-03 — suppliers and customers stay organization-wide (A-06).
    it('leaves suppliers and customers unscoped on type=all', async () => {
      const { handler } = makeHandler({
        suppliers: { rows: [{ id: 's1', code: 'NCC1', name: 'Beta', phone: '1' }], total: 1 },
        customers: { rows: [{ id: 'c1', code: 'KH1', name: 'Alpha', phone: '2', address: 'a' }], total: 1 },
        employees: oneEmployee,
      });

      const res = await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.ALL, page: 1, pageSize: 20 },
          actor,
        ),
      );

      expect(res.data.map((d) => d.kind)).toEqual(['customer', 'supplier', 'employee']);
      expect(res.total).toBe(3);
    });

    // AC-04 / AC-12 — no branch, nothing back, and no query attempted.
    it('returns nothing without querying when the scope is none', async () => {
      const { handler, userQbs } = makeHandler({
        suppliers: noParties,
        customers: noParties,
        employees: oneEmployee,
        scope: { mode: 'none' },
      });

      const res = await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.EMPLOYEE, page: 1, pageSize: 20 },
          actor,
        ),
      );

      expect(res).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
      expect(userQbs).toHaveLength(0);
    });

    // AC-10 — the bypass leaves the query exactly as it was before this feature.
    it('adds no predicate when the scope is all', async () => {
      const { handler, userQbs } = makeHandler({
        suppliers: noParties,
        customers: noParties,
        employees: oneEmployee,
        scope: { mode: 'all' },
      });

      const res = await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.EMPLOYEE, page: 1, pageSize: 20 },
          actor,
        ),
      );

      expect(res.total).toBe(1);
      expect(
        employeePredicates(userQbs).filter(([sql]) =>
          sql.includes('user_branch_assignments'),
        ),
      ).toEqual([]);
    });

    it('resolves the scope once per request, even when fanning out over kinds', async () => {
      const { handler, resolve } = makeHandler({
        suppliers: { rows: [], total: 0 },
        customers: { rows: [], total: 0 },
        employees: oneEmployee,
      });

      await handler.execute(
        new SearchCounterpartiesQuery(
          { type: CounterpartyKind.ALL, page: 1, pageSize: 20 },
          actor,
        ),
      );

      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });
});
