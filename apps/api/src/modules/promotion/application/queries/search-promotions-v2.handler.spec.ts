import { PromotionProgramType, PromotionStatus } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { SearchPromotionsV2Handler } from './search-promotions-v2.handler';
import { SearchPromotionsV2Query } from './search-promotions-v2.query';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PromotionSearchV2Dto } from '../dto/promotion-search-v2.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionAccess } from '../promotion-access.policy';

/** `forActor` stub: chain manager (today's behaviour) unless a test swaps in a branch manager. */
function accessStub(isChainManager = true) {
  return {
    forActor: jest.fn(async (actor: ActorContext) => new PromotionAccess(isChainManager, actor.branchId)),
  };
}

interface WhereCall {
  sql: string;
  params?: Record<string, unknown>;
}

/** A minimal QueryBuilder stub that records every where/order/paging call so tests can assert on them directly. */
function makeQueryBuilderRepo(result: { data: unknown[]; total: number }) {
  const whereCalls: WhereCall[] = [];
  const orderCalls: { col: string; dir: string }[] = [];
  let skipValue: number | undefined;
  let takeValue: number | undefined;

  const qb: any = {
    where(sql: string, params?: Record<string, unknown>) {
      whereCalls.push({ sql, params });
      return qb;
    },
    andWhere(sql: string, params?: Record<string, unknown>) {
      whereCalls.push({ sql, params });
      return qb;
    },
    orderBy(col: string, dir: string) {
      orderCalls.push({ col, dir });
      return qb;
    },
    addOrderBy(col: string, dir: string) {
      orderCalls.push({ col, dir });
      return qb;
    },
    skip(value: number) {
      skipValue = value;
      return qb;
    },
    take(value: number) {
      takeValue = value;
      return qb;
    },
    async getManyAndCount() {
      return [result.data, result.total];
    },
  };

  const query = jest.fn(async (_sql: string, _params: unknown[]) => [] as { id: string; name: string }[]);
  const repo = { createQueryBuilder: () => qb, manager: { query } };
  return { repo, query, whereCalls, orderCalls, getSkip: () => skipValue, getTake: () => takeValue };
}

function actorWithBranch(branchId?: string): ActorContext {
  return { userId: 'user-1', organizationId: 'org-1', branchId, roles: [] };
}

describe('SearchPromotionsV2Handler', () => {
  it('always filters by organizationId and excludes soft-deleted rows', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(whereCalls[0]).toMatchObject({ sql: 'p.organizationId = :orgId', params: { orgId: 'org-1' } });
    expect(whereCalls.some((c) => c.sql === 'p.deletedAt IS NULL')).toBe(true);
  });

  it('does not add branch scope when actor has no branchId', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch(undefined)));

    expect(whereCalls.some((c) => c.sql.includes('promotion_branches'))).toBe(false);
  });

  // A-08 (2026100301): a chain manager is no longer narrowed to the programs
  // applicable to the active branch — that clause now belongs to branch managers.
  it('does not narrow a chain manager to the active branch', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch('branch-1')));

    expect(whereCalls.some((c) => c.sql.includes('promotion_branches') || c.sql.includes('ownerBranchId'))).toBe(false);
  });

  it('does not apply a default status filter — FR-004 default is a FE-side chip, not a hidden server filter', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(whereCalls.some((c) => c.sql.includes('p.status'))).toBe(false);
  });

  it('applies the name StringFilterDto', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(
      new SearchPromotionsV2Query({ name: { operator: StringOperator.CONTAINS, value: 'Tet' } }, actorWithBranch()),
    );

    expect(whereCalls.some((c) => c.sql.includes('p.name') && c.sql.includes('ILIKE'))).toBe(true);
  });

  it('applies the type/status/applyTo EnumFilterDto by their .value', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(
      new SearchPromotionsV2Query(
        { type: { value: PromotionProgramType.ITEM_DISCOUNT }, status: { value: PromotionStatus.TRACKING } },
        actorWithBranch(),
      ),
    );

    expect(whereCalls.some((c) => c.sql.startsWith('p.type ='))).toBe(true);
    expect(whereCalls.some((c) => c.sql.startsWith('p.status ='))).toBe(true);
  });

  it('applies startDate/endDate DateRangeFilterDto', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(
      new SearchPromotionsV2Query({ startDate: { from: '2026-01-01' }, endDate: { to: '2026-12-31' } }, actorWithBranch()),
    );

    expect(whereCalls.some((c) => c.sql.includes('p.startDate >='))).toBe(true);
    expect(whereCalls.some((c) => c.sql.includes('p.endDate <'))).toBe(true);
  });

  // An open-ended promotion (BR-003 allows both dates to be null) belongs to
  // every period. A plain `col >= :from` would drop it, because `NULL >= x` is
  // NULL — that is exactly what hid KM000001 from the list on 2026-08-03.
  it('keeps NULL dates inside every period range', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(
      new SearchPromotionsV2Query(
        { startDate: { from: '2026-01-01', to: '2026-12-31' }, endDate: { from: '2026-01-01' } },
        actorWithBranch(),
      ),
    );

    const dateClauses = whereCalls.filter((c) => /p\.(startDate|endDate)/.test(c.sql));
    expect(dateClauses).toHaveLength(3);
    for (const clause of dateClauses) {
      expect(clause.sql).toMatch(/IS NULL OR/);
    }
    // `to` stays inclusive of the whole day, same convention as FilterBuilder.
    expect(whereCalls.some((c) => c.sql.includes("INTERVAL '1 day'"))).toBe(true);
  });

  it('leaves date columns unfiltered when no period is supplied', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(whereCalls.some((c) => /p\.(startDate|endDate)/.test(c.sql))).toBe(false);
  });

  it('defaults to page 1, limit 50, and sorts by priority ASC then createdAt DESC', async () => {
    const { repo, getSkip, getTake, orderCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    const result = await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(getSkip()).toBe(0);
    expect(getTake()).toBe(50);
    expect(orderCalls).toEqual([
      { col: 'p.priority', dir: 'ASC' },
      { col: 'p.createdAt', dir: 'DESC' },
    ]);
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 });
  });

  it('honors custom page/limit for skip/take', async () => {
    const { repo, getSkip, getTake } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    await handler.execute(new SearchPromotionsV2Query({ page: 3, limit: 20 }, actorWithBranch()));

    expect(getSkip()).toBe(40);
    expect(getTake()).toBe(20);
  });

  it('maps each result row through toSummary', async () => {
    const entity = {
      id: 'p1',
      code: 'KM000001',
      name: 'Test',
      description: undefined,
      type: PromotionProgramType.INVOICE_DISCOUNT,
      status: PromotionStatus.TRACKING,
      priority: 100,
      applyTo: 'ALL_CUSTOMERS',
      startDate: undefined,
      endDate: undefined,
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 2),
    };
    const { repo } = makeQueryBuilderRepo({ data: [entity], total: 1 });
    const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

    const result = await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(result.data).toEqual([
      {
        id: 'p1',
        code: 'KM000001',
        name: 'Test',
        description: undefined,
        type: PromotionProgramType.INVOICE_DISCOUNT,
        status: PromotionStatus.TRACKING,
        priority: 100,
        applyTo: 'ALL_CUSTOMERS',
        startDate: undefined,
        endDate: undefined,
        ownerBranchId: null,
        ownerBranchName: null,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      },
    ]);
  });

  describe('branch manager scope (2026100301 AC-08)', () => {
    it('narrows to own-branch programs plus chain programs applicable to the active branch', async () => {
      const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
      const handler = new SearchPromotionsV2Handler(repo as any, accessStub(false) as any);

      await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch('branch-hcm')));

      const scope = whereCalls.filter((c) => c.sql.includes('promotion_branches'));
      expect(scope).toHaveLength(1);
      const sql = scope[0].sql.replace(/\s+/g, ' ');
      expect(sql).toContain('p.ownerBranchId = :branchId OR ( p.ownerBranchId IS NULL AND');
      expect(scope[0].params).toEqual({ branchId: 'branch-hcm' });
    });

    it('refuses a branch manager without an active branch (403)', async () => {
      const { repo } = makeQueryBuilderRepo({ data: [], total: 0 });
      const handler = new SearchPromotionsV2Handler(repo as any, accessStub(false) as any);

      await expect(handler.execute(new SearchPromotionsV2Query({}, actorWithBranch(undefined)))).rejects.toMatchObject({
        status: 403,
      });
    });

    it('returns ownerBranchId/ownerBranchName per row, null for chain programs, in one org-scoped lookup', async () => {
      const row = (id: string, ownerBranchId: string | null) => ({
        id,
        code: id,
        name: id,
        type: PromotionProgramType.ITEM_DISCOUNT,
        status: PromotionStatus.TRACKING,
        priority: 100,
        applyTo: 'ALL_CUSTOMERS',
        ownerBranchId,
        createdAt: new Date(2026, 0, 1),
        updatedAt: new Date(2026, 0, 1),
      });
      const { repo, query } = makeQueryBuilderRepo({ data: [row('a', 'branch-hcm'), row('b', null)], total: 2 });
      query.mockResolvedValue([{ id: 'branch-hcm', name: 'Hồ Chí Minh' }]);
      const handler = new SearchPromotionsV2Handler(repo as any, accessStub(false) as any);

      const result = await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch('branch-hcm')));

      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual(['org-1', ['branch-hcm']]);
      expect(result.data.map((d) => [d.ownerBranchId, d.ownerBranchName])).toEqual([
        ['branch-hcm', 'Hồ Chí Minh'],
        [null, null],
      ]);
    });
  });

  describe('chain manager owner filter (2026100301 AC-10)', () => {
    it("owner = CHAIN keeps only chain-owned programs", async () => {
      const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
      const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

      await handler.execute(new SearchPromotionsV2Query({ owner: { value: 'CHAIN' } }, actorWithBranch('branch-hn')));

      expect(whereCalls.filter((c) => c.sql.includes('ownerBranchId'))).toEqual([{ sql: 'p.ownerBranchId IS NULL' }]);
    });

    it('owner = a branch id keeps only that branch\'s own programs', async () => {
      const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
      const handler = new SearchPromotionsV2Handler(repo as any, accessStub() as any);

      await handler.execute(new SearchPromotionsV2Query({ owner: { value: 'branch-hcm' } }, actorWithBranch('branch-hn')));

      expect(whereCalls.filter((c) => c.sql.includes('ownerBranchId'))).toEqual([
        { sql: 'p.ownerBranchId = :ownerBranchId', params: { ownerBranchId: 'branch-hcm' } },
      ]);
    });

    it('a branch manager sending owner = another branch still gets only its own scope', async () => {
      const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
      const handler = new SearchPromotionsV2Handler(repo as any, accessStub(false) as any);

      await handler.execute(new SearchPromotionsV2Query({ owner: { value: 'branch-hn' } }, actorWithBranch('branch-hcm')));

      const ownerClauses = whereCalls.filter((c) => c.sql.includes('ownerBranchId'));
      expect(ownerClauses).toHaveLength(1);
      expect(ownerClauses[0].params).toEqual({ branchId: 'branch-hcm' });
    });
  });

  describe('owner filter validation', () => {
    const errorsFor = (value: unknown) =>
      validate(plainToInstance(PromotionSearchV2Dto, { owner: { value } })).then((errors) => errors.length);

    it.each(['CHAIN', 'b0000000-0000-4000-8000-000000000001'])('accepts %s', async (value) => {
      expect(await errorsFor(value)).toBe(0);
    });

    it.each(['chain-ish', 'not-a-uuid', ''])('rejects %p (→ 400 via the global ValidationPipe)', async (value) => {
      expect(await errorsFor(value)).toBeGreaterThan(0);
    });
  });
});
