import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomerEntity } from '../../customer/customer.entity';
import { SearchCustomersV2Handler } from './search-customers-v2.handler';
import { SearchCustomersV2Query } from './search-customers-v2.query';
import { StringOperator } from '../../../common/filters/filter.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
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

describe('SearchCustomersV2Handler', () => {
  let handler: SearchCustomersV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([[{ id: 'c-1', code: 'KH000001' }], 1]);
    repo = { createQueryBuilder: jest.fn(() => qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCustomersV2Handler,
        { provide: getRepositoryToken(CustomerEntity), useValue: repo },
      ],
    }).compile();

    handler = module.get(SearchCustomersV2Handler);
  });

  it('scopes by organizationId and returns the { data, total, page, limit } envelope', async () => {
    const result = await handler.execute(
      new SearchCustomersV2Query({ page: 2, limit: 10 }, actor),
    );

    expect(qb.where).toHaveBeenCalledWith('customer.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.skip).toHaveBeenCalledWith(10); // (2 - 1) * 10
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: [{ id: 'c-1', code: 'KH000001' }],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('does not branch-scope (org-scoped entity) but applies branchId as an explicit filter', async () => {
    await handler.execute(
      new SearchCustomersV2Query({ branchId: 'branch-9' }, actor),
    );

    // No implicit branch scoping from the actor.
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'customer.branchId = :branchId',
      { branchId: 'branch-1' },
    );
    // Explicit filter uses the dto value.
    expect(qb.andWhere).toHaveBeenCalledWith('customer.branchId = :branchId', {
      branchId: 'branch-9',
    });
  });

  it('applies the code string filter via FilterBuilder (ILIKE for CONTAINS)', async () => {
    await handler.execute(
      new SearchCustomersV2Query(
        { code: { operator: StringOperator.CONTAINS, value: 'KH00' } },
        actor,
      ),
    );

    const calledWithIlike = qb.andWhere.mock.calls.some(
      (c: [string, Record<string, unknown>]) =>
        c[0].includes('customer.code ILIKE') &&
        Object.values(c[1])[0] === '%KH00%',
    );
    expect(calledWithIlike).toBe(true);
  });

  it('defaults page=1 limit=20 when omitted', async () => {
    const result = await handler.execute(
      new SearchCustomersV2Query({}, actor),
    );
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
