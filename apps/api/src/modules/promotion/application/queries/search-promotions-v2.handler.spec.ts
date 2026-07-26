import { PromotionProgramType, PromotionStatus } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { SearchPromotionsV2Handler } from './search-promotions-v2.handler';
import { SearchPromotionsV2Query } from './search-promotions-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

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

  const repo = { createQueryBuilder: () => qb };
  return { repo, whereCalls, orderCalls, getSkip: () => skipValue, getTake: () => takeValue };
}

function actorWithBranch(branchId?: string): ActorContext {
  return { userId: 'user-1', organizationId: 'org-1', branchId, roles: [] };
}

describe('SearchPromotionsV2Handler', () => {
  it('always filters by organizationId and excludes soft-deleted rows', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(whereCalls[0]).toMatchObject({ sql: 'p.organizationId = :orgId', params: { orgId: 'org-1' } });
    expect(whereCalls.some((c) => c.sql === 'p.deletedAt IS NULL')).toBe(true);
  });

  it('does not add branch scope when actor has no branchId', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch(undefined)));

    expect(whereCalls.some((c) => c.sql.includes('promotion_branches'))).toBe(false);
  });

  it('adds the whole-chain-or-matching-branch scope when actor has a branchId', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch('branch-1')));

    const branchClause = whereCalls.find((c) => c.sql.includes('promotion_branches'));
    expect(branchClause?.sql).toContain('NOT EXISTS');
    expect(branchClause?.sql).toContain('EXISTS');
    expect(branchClause?.params).toEqual({ branchId: 'branch-1' });
  });

  it('does not apply a default status filter — FR-004 default is a FE-side chip, not a hidden server filter', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

    await handler.execute(new SearchPromotionsV2Query({}, actorWithBranch()));

    expect(whereCalls.some((c) => c.sql.includes('p.status'))).toBe(false);
  });

  it('applies the name StringFilterDto', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

    await handler.execute(
      new SearchPromotionsV2Query({ name: { operator: StringOperator.CONTAINS, value: 'Tet' } }, actorWithBranch()),
    );

    expect(whereCalls.some((c) => c.sql.includes('p.name') && c.sql.includes('ILIKE'))).toBe(true);
  });

  it('applies the type/status/applyTo EnumFilterDto by their .value', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

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
    const handler = new SearchPromotionsV2Handler(repo as any);

    await handler.execute(
      new SearchPromotionsV2Query({ startDate: { from: '2026-01-01' }, endDate: { to: '2026-12-31' } }, actorWithBranch()),
    );

    expect(whereCalls.some((c) => c.sql.startsWith('p.startDate >='))).toBe(true);
    expect(whereCalls.some((c) => c.sql.includes('p.endDate <'))).toBe(true);
  });

  it('defaults to page 1, limit 50, and sorts by priority ASC then createdAt DESC', async () => {
    const { repo, getSkip, getTake, orderCalls } = makeQueryBuilderRepo({ data: [], total: 0 });
    const handler = new SearchPromotionsV2Handler(repo as any);

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
    const handler = new SearchPromotionsV2Handler(repo as any);

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
    const handler = new SearchPromotionsV2Handler(repo as any);

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
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      },
    ]);
  });
});
