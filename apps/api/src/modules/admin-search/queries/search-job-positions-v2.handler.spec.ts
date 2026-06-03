import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JobPositionEntity } from '../../hr/job-position/job-position.entity';
import { SearchJobPositionsV2Handler } from './search-job-positions-v2.handler';
import { SearchJobPositionsV2Query } from './search-job-positions-v2.query';
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

describe('SearchJobPositionsV2Handler', () => {
  let handler: SearchJobPositionsV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([[{ id: 'jp-1', name: 'Cashier' }], 1]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchJobPositionsV2Handler,
        { provide: getRepositoryToken(JobPositionEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchJobPositionsV2Handler);
  });

  it('scopes by organizationId and returns the envelope', async () => {
    const result = await handler.execute(
      new SearchJobPositionsV2Query({}, actor),
    );
    expect(qb.where).toHaveBeenCalledWith('jp.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(result).toEqual({
      data: [{ id: 'jp-1', name: 'Cashier' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('applies the isActive boolean filter', async () => {
    await handler.execute(
      new SearchJobPositionsV2Query({ isActive: false }, actor),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('jp.isActive = :isActive', {
      isActive: false,
    });
  });
});
