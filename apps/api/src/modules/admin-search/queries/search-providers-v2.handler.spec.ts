import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProviderEntity } from '../../inventory/location/provider.entity';
import { SearchProvidersV2Handler } from './search-providers-v2.handler';
import { SearchProvidersV2Query } from './search-providers-v2.query';
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

describe('SearchProvidersV2Handler', () => {
  let handler: SearchProvidersV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchProvidersV2Handler,
        { provide: getRepositoryToken(ProviderEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchProvidersV2Handler);
  }

  it('scopes by organizationId and joins the supplier group', async () => {
    await build([]);
    await handler.execute(new SearchProvidersV2Query({}, actor));

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'provider.group',
      'group',
    );
    expect(qb.where).toHaveBeenCalledWith('provider.organizationId = :orgId', {
      orgId: 'org-1',
    });
  });

  it('flattens group.name into groupName and drops the nested group object', async () => {
    await build([
      { id: 'p-1', name: 'Acme', group: { id: 'g-1', name: 'Hardware' } },
      { id: 'p-2', name: 'Beta', group: undefined },
    ]);

    const result = await handler.execute(
      new SearchProvidersV2Query({}, actor),
    );

    expect(result.data[0]).toEqual({ id: 'p-1', name: 'Acme', groupName: 'Hardware' });
    expect(result.data[1]).toEqual({ id: 'p-2', name: 'Beta', groupName: '' });
    expect(result.data[0]).not.toHaveProperty('group');
  });

  it('applies boolean isActive/isCustomer and groupId filters', async () => {
    await build([]);
    await handler.execute(
      new SearchProvidersV2Query(
        { isActive: true, isCustomer: false, groupId: 'g-9' },
        actor,
      ),
    );

    expect(qb.andWhere).toHaveBeenCalledWith('provider.isActive = :isActive', {
      isActive: true,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'provider.isCustomer = :isCustomer',
      { isCustomer: false },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('provider.groupId = :groupId', {
      groupId: 'g-9',
    });
  });

  it('returns the { data, total, page, limit } envelope', async () => {
    await build([{ id: 'p-1', name: 'Acme', group: undefined }], 7);
    const result = await handler.execute(
      new SearchProvidersV2Query({ page: 3, limit: 5 }, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.total).toBe(7);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });
});
