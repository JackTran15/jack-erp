import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StringOperator } from '../../../common/filters/filter.dto';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { SearchStoragesV2Handler } from './search-storages-v2.handler';
import { SearchStoragesV2Query } from './search-storages-v2.query';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchStoragesV2Handler', () => {
  let handler: SearchStoragesV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStoragesV2Handler,
        { provide: getRepositoryToken(StorageEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchStoragesV2Handler);
  }

  it('scopes by organizationId and orders by name ASC', async () => {
    await build([]);
    await handler.execute(new SearchStoragesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('storage.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('storage.name', 'ASC');
  });

  it('isolates cross-org: org B never reaches data scoped to org A', async () => {
    await build([]);
    const orgBActor: ActorContext = { ...actor, organizationId: 'org-2' };
    await handler.execute(new SearchStoragesV2Query({}, orgBActor));

    expect(qb.where).toHaveBeenCalledWith('storage.organizationId = :orgId', {
      orgId: 'org-2',
    });
    expect(qb.where).not.toHaveBeenCalledWith('storage.organizationId = :orgId', {
      orgId: 'org-1',
    });
  });

  it('confines to the active branch when the actor carries one', async () => {
    await build([]);
    await handler.execute(
      new SearchStoragesV2Query({}, { ...actor, branchId: 'br-1' }),
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      'storage.branchId = :actorBranchId',
      { actorBranchId: 'br-1' },
    );
  });

  it('applies name filter and exact branchId / isMainStorage filters', async () => {
    await build([]);
    await handler.execute(
      new SearchStoragesV2Query(
        {
          name: { operator: StringOperator.CONTAINS, value: 'Kho chính' },
          branchId: 'br-9',
          isMainStorage: true,
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([expect.stringContaining('storage.name ILIKE')]),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('storage.branchId = :branchId', {
      branchId: 'br-9',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'storage.isMainStorage = :isMainStorage',
      { isMainStorage: true },
    );
  });

  it('returns the { data, total, page, limit } envelope', async () => {
    const rows = [{ id: 's-1', name: 'Kho chính', branchId: 'br-1' }];
    await build(rows, 5);
    const result = await handler.execute(
      new SearchStoragesV2Query({ page: 2, limit: 3 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(3);
    expect(qb.take).toHaveBeenCalledWith(3);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(3);
  });
});
