import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LocationType } from '@erp/shared-interfaces';
import { StringOperator } from '../../../common/filters/filter.dto';
import { LocationEntity } from '../../inventory/location/location.entity';
import { SearchLocationsV2Handler } from './search-locations-v2.handler';
import { SearchLocationsV2Query } from './search-locations-v2.query';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchLocationsV2Handler', () => {
  let handler: SearchLocationsV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchLocationsV2Handler,
        { provide: getRepositoryToken(LocationEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchLocationsV2Handler);
  }

  it('scopes by organizationId, joins storage, orders by code ASC', async () => {
    await build([]);
    await handler.execute(new SearchLocationsV2Query({}, actor));

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'location.storage',
      'storage',
    );
    expect(qb.where).toHaveBeenCalledWith('location.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('location.code', 'ASC');
  });

  it('isolates cross-org: org B never reaches data scoped to org A', async () => {
    await build([]);
    const orgBActor: ActorContext = { ...actor, organizationId: 'org-2' };
    await handler.execute(new SearchLocationsV2Query({}, orgBActor));

    expect(qb.where).toHaveBeenCalledWith('location.organizationId = :orgId', {
      orgId: 'org-2',
    });
    expect(qb.where).not.toHaveBeenCalledWith(
      'location.organizationId = :orgId',
      { orgId: 'org-1' },
    );
  });

  it('flattens storage.name into storageName and drops the nested storage', async () => {
    await build([
      { id: 'l-1', code: 'A01', storage: { id: 's-1', name: 'Kho chính' } },
      { id: 'l-2', code: 'A02', storage: undefined },
    ]);

    const result = await handler.execute(new SearchLocationsV2Query({}, actor));

    expect(result.data[0]).toEqual({
      id: 'l-1',
      code: 'A01',
      storageName: 'Kho chính',
    });
    expect(result.data[1]).toEqual({ id: 'l-2', code: 'A02', storageName: '' });
    expect(result.data[0]).not.toHaveProperty('storage');
  });

  it('applies code/name/type filters and exact storageId / isActive filters', async () => {
    await build([]);
    await handler.execute(
      new SearchLocationsV2Query(
        {
          code: { operator: StringOperator.STARTS_WITH, value: 'A0' },
          name: { operator: StringOperator.CONTAINS, value: 'Kệ' },
          type: { value: LocationType.SHELF },
          storageId: 's-9',
          isActive: false,
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('location.code ILIKE'),
        expect.stringContaining('location.name ILIKE'),
        expect.stringContaining('location.type ='),
      ]),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('location.storageId = :storageId', {
      storageId: 's-9',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('location.isActive = :isActive', {
      isActive: false,
    });
  });

  it('returns the { data, total, page, limit } envelope', async () => {
    await build([{ id: 'l-1', code: 'A01', storage: undefined }], 8);
    const result = await handler.execute(
      new SearchLocationsV2Query({ page: 3, limit: 5 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.total).toBe(8);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });
});
