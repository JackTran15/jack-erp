import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import { PayableEntity } from '../../accounting/payables/payable.entity';
import { SearchPayablesV2Handler } from './search-payables-v2.handler';
import { SearchPayablesV2Query } from './search-payables-v2.query';

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

describe('SearchPayablesV2Handler', () => {
  let handler: SearchPayablesV2Handler;
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([
      [
        {
          id: 'payable-1',
          documentNumber: 'AP-001',
          vendorName: 'Acme',
          accountId: 'account-1',
          branchId: 'branch-9',
          settledAmount: 25,
        },
      ],
      1,
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPayablesV2Handler,
        {
          provide: getRepositoryToken(PayableEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();

    handler = module.get(SearchPayablesV2Handler);
  });

  it('scopes by organization and returns paginated full entity rows', async () => {
    const result = await handler.execute(
      new SearchPayablesV2Query({ page: 2, limit: 10 }, actor),
    );

    expect(qb.where).toHaveBeenCalledWith('payable.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: [
        {
          id: 'payable-1',
          documentNumber: 'AP-001',
          vendorName: 'Acme',
          accountId: 'account-1',
          branchId: 'branch-9',
          settledAmount: 25,
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('applies all requested dynamic filters', async () => {
    await handler.execute(
      new SearchPayablesV2Query(
        {
          documentNumber: {
            operator: StringOperator.CONTAINS,
            value: 'AP',
          },
          vendorName: { operator: StringOperator.CONTAINS, value: 'Acme' },
          currency: { operator: StringOperator.EQUALS, value: 'USD' },
          amount: { operator: CompareOperator.GTE, value: 100 },
          settledAmount: { operator: CompareOperator.LT, value: 50 },
          dueDate: { from: '2026-06-01', to: '2026-06-30' },
          status: { value: 'POSTED' },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map(([clause]: [string]) => clause);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('payable.documentNumber ILIKE'),
        expect.stringContaining('payable.vendorName ILIKE'),
        expect.stringContaining('payable.currency ='),
        expect.stringContaining('payable.amount >='),
        expect.stringContaining('payable.settledAmount <'),
        expect.stringContaining('payable.dueDate >='),
        expect.stringContaining('payable.dueDate <'),
        expect.stringContaining('payable.status ='),
      ]),
    );
  });
});
