import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LocationType } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { LocationEntity } from '../location.entity';
import { SearchLocationsV2Handler } from './search-locations-v2.handler';
import { SearchLocationsV2Query } from './search-locations-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function makeQb(entities: unknown[], raw: unknown[], total: number) {
  const countQb: any = { getCount: jest.fn().mockResolvedValue(total) };
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    offset: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    clone: jest.fn(() => countQb),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
  };
  return { qb, countQb };
}

describe('SearchLocationsV2Handler', () => {
  let handler: SearchLocationsV2Handler;
  let qb: ReturnType<typeof makeQb>['qb'];

  async function build(entities: unknown[] = [], raw: unknown[] = [], total = 0) {
    const mocks = makeQb(entities, raw, total);
    qb = mocks.qb;
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchLocationsV2Handler,
        { provide: getRepositoryToken(LocationEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchLocationsV2Handler);
  }

  const andWhereSql = () =>
    qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);

  it('scopes by org + branch (via storage) and hides the unassigned location', async () => {
    await build();
    await handler.execute(new SearchLocationsV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith(
      'location.organizationId = :organizationId',
      { organizationId: 'org-1' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('storage.branchId = :branchId', {
      branchId: 'branch-1',
    });
    expect(andWhereSql()).toContain('location.isUnassigned = false');
    expect(qb.orderBy).toHaveBeenCalledWith('location.code', 'ASC');
  });

  it('omits the branch filter when the actor has no active branch, and keeps the unassigned location when asked', async () => {
    await build();
    await handler.execute(
      new SearchLocationsV2Query(
        { includeUnassigned: true },
        { ...actor, branchId: undefined },
      ),
    );

    expect(andWhereSql()).not.toContain('storage.branchId = :branchId');
    expect(andWhereSql()).not.toContain('location.isUnassigned = false');
  });

  it('maps each string operator to the matching SQL', async () => {
    const cases: [StringOperator, string][] = [
      [StringOperator.CONTAINS, 'location.code ILIKE'],
      [StringOperator.EQUALS, 'location.code ='],
      [StringOperator.STARTS_WITH, 'location.code ILIKE'],
      [StringOperator.ENDS_WITH, 'location.code ILIKE'],
      [StringOperator.NOT_CONTAINS, 'location.code NOT ILIKE'],
    ];

    for (const [operator, sql] of cases) {
      await build();
      await handler.execute(
        new SearchLocationsV2Query({ code: { operator, value: 'A-01' } }, actor),
      );
      expect(andWhereSql()).toEqual(
        expect.arrayContaining([expect.stringContaining(sql)]),
      );
    }
  });

  it('applies name, description (COALESCE) and storageId filters', async () => {
    await build();
    await handler.execute(
      new SearchLocationsV2Query(
        {
          name: { operator: StringOperator.CONTAINS, value: 'Kệ' },
          description: { operator: StringOperator.NOT_CONTAINS, value: 'hỏng' },
          storageId: { value: 'storage-1' },
          isActive: false,
        },
        actor,
      ),
    );

    expect(andWhereSql()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('location.name ILIKE'),
        expect.stringContaining("COALESCE(location.description, '') NOT ILIKE"),
        expect.stringContaining('location.storageId ='),
      ]),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('location.isActive = :isActive', {
      isActive: false,
    });
  });

  it('filters "Đã xếp" with EXISTS and "Chưa xếp" with NOT EXISTS', async () => {
    await build();
    await handler.execute(new SearchLocationsV2Query({ hasItems: true }, actor));
    expect(andWhereSql()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^EXISTS \(/)]),
    );

    await build();
    await handler.execute(new SearchLocationsV2Query({ hasItems: false }, actor));
    expect(andWhereSql()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^NOT EXISTS \(/)]),
    );
  });

  // The query builder is mocked here, so these pin the SQL shape only. The
  // behaviour they stand for — a shelf whose rows are all untracked reading as
  // "Chưa xếp" — is proved against real Postgres in
  // test/e2e/inventory-location-stock.e2e-spec.ts.
  it('scopes "Đã xếp" to tracked rows in both filter directions', async () => {
    await build();
    await handler.execute(new SearchLocationsV2Query({ hasItems: true }, actor));
    const positive = andWhereSql().find((sql: string) => sql.startsWith('EXISTS ('));
    expect(positive).toContain('sb.is_tracked = true');

    await build();
    await handler.execute(new SearchLocationsV2Query({ hasItems: false }, actor));
    const negative = andWhereSql().find((sql: string) => sql.startsWith('NOT EXISTS ('));
    // "Chưa xếp" is NOT EXISTS(tracked), not EXISTS(untracked) — the two differ
    // on a location holding both kinds of row.
    expect(negative).toContain('sb.is_tracked = true');
    expect(negative).not.toContain('is_tracked = false');
  });

  it('projects hasItems from the same tracked-only predicate it filters on', async () => {
    await build();
    await handler.execute(new SearchLocationsV2Query({ hasItems: true }, actor));

    const [projection] = qb.addSelect.mock.calls[0] as [string, string];
    const predicate = andWhereSql().find((sql: string) => sql.startsWith('EXISTS ('));
    // One constant, so the column and its filter cannot drift apart.
    expect(projection).toBe(predicate);
    expect(projection).toContain('sb.is_tracked = true');
  });

  it('never filters "Đã xếp" by quantity', async () => {
    await build();
    await handler.execute(new SearchLocationsV2Query({ hasItems: true }, actor));
    // A tracked shelf that is temporarily empty is still "Đã xếp" (A-03).
    expect(andWhereSql().join('\n')).not.toContain('sb.quantity');
  });

  it('paginates and projects hasItems from the raw EXISTS column', async () => {
    const entity = {
      id: 'loc-1',
      code: 'A-01',
      name: 'Kệ A1',
      storageId: 'storage-1',
      branchId: 'branch-1',
      type: LocationType.SHELF,
      description: null,
      isActive: true,
      isDefault: false,
    };
    await build([entity], [{ has_items: true }], 42);

    const result = await handler.execute(
      new SearchLocationsV2Query({ page: 3, limit: 20 }, actor),
    );

    expect(qb.offset).toHaveBeenCalledWith(40);
    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [{ ...entity, hasItems: true }],
      total: 42,
      page: 3,
      limit: 20,
    });
  });
});
