import { DataSource } from 'typeorm';
import { PartnerLookupService } from './partner-lookup.service';
import { PartnerLookupType } from './dto/query-partner-lookup.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { EmployeeScope } from '../../../rbac/employee-branch-scope.service';

const ORG = 'org-1';
const BRANCH_HN = 'branch-hn';

function actor(): ActorContext {
  return {
    userId: 'user-1',
    organizationId: ORG,
    branchId: BRANCH_HN,
    branchIds: [BRANCH_HN],
    roles: [],
  };
}

/**
 * A DataSource stubbed down to `query`, recording every (sql, params) pair.
 *
 * The count query runs first and the page query second, so the two calls are
 * addressed by index below.
 */
function dataSourceSpy(rows: unknown[] = []) {
  const query = jest
    .fn()
    .mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('COUNT(*)') ? [{ total: rows.length }] : rows,
      ),
    );
  return { dataSource: { query } as unknown as DataSource, query };
}

/** The service with its scope dependency stubbed to a fixed answer. */
function makeService(
  dataSource: DataSource,
  scope: EmployeeScope = { mode: 'branch', branchId: BRANCH_HN },
): { service: PartnerLookupService; resolve: jest.Mock } {
  const resolve = jest.fn().mockResolvedValue(scope);
  return {
    service: new PartnerLookupService(dataSource, { resolve } as never),
    resolve,
  };
}

/**
 * Postgres rejects a statement carrying more parameters than it references.
 * node-pg reports it as "bind message supplies N parameters, but prepared
 * statement requires M" — so counting `$n` in the SQL is the check that would
 * have caught it before it reached a database.
 */
function highestPlaceholder(sql: string): number {
  const found = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  return found.length ? Math.max(...found) : 0;
}

describe('PartnerLookupService.lookup', () => {
  const TYPES = [
    PartnerLookupType.CUSTOMER,
    PartnerLookupType.SUPPLIER,
    PartnerLookupType.EMPLOYEE,
    PartnerLookupType.ALL,
  ];

  const SCOPES: Array<[string, EmployeeScope]> = [
    ['all', { mode: 'all' }],
    ['branch', { mode: 'branch', branchId: BRANCH_HN }],
    ['none', { mode: 'none' }],
  ];

  // The invariant that matters, held across every type × every scope: Postgres
  // rejects a statement carrying more parameters than it references, and that
  // failure lands on the lookup types the change never touched.
  it.each(
    TYPES.flatMap((type) => SCOPES.map(([label, scope]) => [type, label, scope])),
  )(
    'binds exactly as many parameters as the SQL references (type=%s, scope=%s)',
    async (type, _label, scope) => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource, scope as EmployeeScope);

      await service.lookup(
        { type, page: 1, pageSize: 20 } as never,
        actor(),
      );

      for (const [sql, params] of query.mock.calls) {
        expect(highestPlaceholder(sql as string)).toBe(
          (params as unknown[]).length,
        );
      }
    },
  );

  it.each(TYPES)(
    'passes org and search pattern as $1 and $2, and nothing else when unscoped (type=%s)',
    async (type) => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource, { mode: 'all' });

      await service.lookup(
        { type, page: 1, pageSize: 20, search: 'anh' } as never,
        actor(),
      );

      const [, countParams] = query.mock.calls[0];
      expect(countParams).toEqual([ORG, '%anh%']);
    },
  );

  it('numbers LIMIT and OFFSET from the parameter list, not from a hardcoded $3/$4', async () => {
    const { dataSource, query } = dataSourceSpy();
    const { service } = makeService(dataSource, { mode: 'all' });

    await service.lookup(
      { type: PartnerLookupType.ALL, page: 3, pageSize: 20 } as never,
      actor(),
    );

    const [pageSql, pageParams] = query.mock.calls[1];
    const params = pageParams as unknown[];
    expect(pageSql).toContain(`LIMIT $${params.length - 1} OFFSET $${params.length}`);
    expect(params.slice(-2)).toEqual([20, 40]);
  });

  it('unions one fragment per kind and only the kinds asked for', async () => {
    const { dataSource, query } = dataSourceSpy();
    const { service } = makeService(dataSource, { mode: 'all' });

    await service.lookup(
      { type: PartnerLookupType.EMPLOYEE, page: 1, pageSize: 20 } as never,
      actor(),
    );

    const [countSql] = query.mock.calls[0];
    expect(countSql).toContain('FROM users u');
    expect(countSql).not.toContain('FROM customers c');
    expect(countSql).not.toContain('FROM inventory_providers p');
    expect(countSql).not.toContain('UNION ALL');
  });

  it('unions all three kinds for type=all', async () => {
    const { dataSource, query } = dataSourceSpy();
    const { service } = makeService(dataSource, { mode: 'all' });

    await service.lookup(
      { type: PartnerLookupType.ALL, page: 1, pageSize: 20 } as never,
      actor(),
    );

    const [countSql] = query.mock.calls[0];
    expect(countSql).toContain('FROM customers c');
    expect(countSql).toContain('FROM inventory_providers p');
    expect(countSql).toContain('FROM users u');
    expect((countSql as string).match(/UNION ALL/g)).toHaveLength(2);
  });

  it('reports total from the count query and pages the rows', async () => {
    const rows = [
      { type: 'employee', id: 'u1', name: 'Nhân viên HN', code: 'NV01', address: null },
    ];
    const { dataSource } = dataSourceSpy(rows);
    const { service } = makeService(dataSource, { mode: 'all' });

    const result = await service.lookup(
      { type: PartnerLookupType.EMPLOYEE, page: 2, pageSize: 20 } as never,
      actor(),
    );

    expect(result).toEqual({
      data: [
        {
          type: 'employee',
          id: 'u1',
          name: 'Nhân viên HN',
          code: 'NV01',
          address: null,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 20,
    });
  });

  describe('branch scope (AC-05, AC-06, AC-07)', () => {
    // AC-05 / AC-06 — one endpoint serves both the "Đối tượng" picker and the
    // "Nhân viên thu/chi" field, so binding the branch here fixes both.
    it('appends the branch parameter and references it from the employee fragment', async () => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource);

      await service.lookup(
        { type: PartnerLookupType.EMPLOYEE, page: 1, pageSize: 20 } as never,
        actor(),
      );

      const [countSql, countParams] = query.mock.calls[0];
      expect(countParams).toEqual([ORG, null, BRANCH_HN]);
      expect(countSql).toContain('user_branch_assignments');
      expect(countSql).toContain('uba.branch_id = $3::uuid');
    });

    // The cast is not decoration: parameters arrive as text and branch_id is uuid.
    it('casts the branch placeholder to uuid', async () => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource);

      await service.lookup(
        { type: PartnerLookupType.ALL, page: 1, pageSize: 20 } as never,
        actor(),
      );

      const [countSql] = query.mock.calls[0];
      expect(countSql).toMatch(/uba\.branch_id = \$\d+::uuid/);
    });

    // AC-07 — the branch parameter lands at $3, so LIMIT/OFFSET must move to
    // $4/$5. Hardcoding them is precisely the bug ADR-03 exists to prevent.
    it('shifts LIMIT and OFFSET past the branch parameter', async () => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource);

      await service.lookup(
        { type: PartnerLookupType.ALL, page: 2, pageSize: 20 } as never,
        actor(),
      );

      const [pageSql, pageParams] = query.mock.calls[1];
      expect(pageSql).toContain('LIMIT $4 OFFSET $5');
      expect(pageParams).toEqual([ORG, null, BRANCH_HN, 20, 20]);
    });

    it('leaves customer and supplier lookups free of the branch parameter', async () => {
      for (const type of [PartnerLookupType.CUSTOMER, PartnerLookupType.SUPPLIER]) {
        const { dataSource, query } = dataSourceSpy();
        const { service } = makeService(dataSource);

        await service.lookup({ type, page: 1, pageSize: 20 } as never, actor());

        const [countSql, countParams] = query.mock.calls[0];
        expect(countParams).toEqual([ORG, null]);
        expect(countSql).not.toContain('user_branch_assignments');
      }
    });

    // AC-12 — an employee-only lookup with no branch has nothing left to union,
    // so it must answer empty rather than build a broken statement.
    it('returns empty without querying for an employee lookup with scope none', async () => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource, { mode: 'none' });

      const res = await service.lookup(
        { type: PartnerLookupType.EMPLOYEE, page: 1, pageSize: 20 } as never,
        actor(),
      );

      expect(res).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
      expect(query).not.toHaveBeenCalled();
    });

    it('drops only the employee fragment from type=all when the scope is none', async () => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource, { mode: 'none' });

      await service.lookup(
        { type: PartnerLookupType.ALL, page: 1, pageSize: 20 } as never,
        actor(),
      );

      const [countSql, countParams] = query.mock.calls[0];
      expect(countSql).toContain('FROM customers c');
      expect(countSql).toContain('FROM inventory_providers p');
      expect(countSql).not.toContain('FROM users u');
      expect(countParams).toEqual([ORG, null]);
    });

    // AC-10 — the bypass leaves the statement byte-identical to before.
    it('adds nothing when the scope is all', async () => {
      const { dataSource, query } = dataSourceSpy();
      const { service } = makeService(dataSource, { mode: 'all' });

      await service.lookup(
        { type: PartnerLookupType.EMPLOYEE, page: 1, pageSize: 20 } as never,
        actor(),
      );

      const [countSql, countParams] = query.mock.calls[0];
      expect(countSql).toContain('FROM users u');
      expect(countSql).not.toContain('user_branch_assignments');
      expect(countParams).toEqual([ORG, null]);
    });

    it('resolves the scope once per lookup', async () => {
      const { dataSource } = dataSourceSpy();
      const { service, resolve } = makeService(dataSource);

      await service.lookup(
        { type: PartnerLookupType.ALL, page: 1, pageSize: 20 } as never,
        actor(),
      );

      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });
});
