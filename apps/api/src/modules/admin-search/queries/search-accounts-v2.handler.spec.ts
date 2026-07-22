import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../accounting/coa/account.entity';
import { SearchAccountsV2Handler } from './search-accounts-v2.handler';
import { SearchAccountsV2Query } from './search-accounts-v2.query';
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

describe('SearchAccountsV2Handler', () => {
  let handler: SearchAccountsV2Handler;
  let repo: { createQueryBuilder: jest.Mock; find: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([
      [{ id: 'a-1', code: '1111', parentAccountId: 'a-0' }],
      1,
    ]);
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      // Parent lookup for the inlined `parentAccountName` label.
      find: jest.fn().mockResolvedValue([
        { id: 'a-0', code: '111', name: 'Tiền mặt' },
      ]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchAccountsV2Handler,
        { provide: getRepositoryToken(AccountEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchAccountsV2Handler);
  });

  it('scopes by organizationId and inlines the parent account label', async () => {
    const result = await handler.execute(new SearchAccountsV2Query({}, actor));
    expect(qb.where).toHaveBeenCalledWith('acc.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(result.data[0]).toEqual({
      id: 'a-1',
      code: '1111',
      parentAccountId: 'a-0',
      parentAccountName: '111 - Tiền mặt',
    });
  });

  it('labels a root account with a dash instead of looking it up', async () => {
    qb.getManyAndCount.mockResolvedValue([
      [{ id: 'a-0', code: '111', parentAccountId: null }],
      1,
    ]);
    const result = await handler.execute(new SearchAccountsV2Query({}, actor));
    expect(repo.find).not.toHaveBeenCalled();
    expect(result.data[0]).not.toHaveProperty('parentAccountName');
  });

  it('applies isActive and parentAccountId filters', async () => {
    await handler.execute(
      new SearchAccountsV2Query(
        { isActive: true, parentAccountId: 'a-9' },
        actor,
      ),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('acc.isActive = :isActive', {
      isActive: true,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'acc.parentAccountId = :parentAccountId',
      { parentAccountId: 'a-9' },
    );
  });
});
