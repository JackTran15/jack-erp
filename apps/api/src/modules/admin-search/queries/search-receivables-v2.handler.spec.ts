import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import { ReceivableEntity } from '../../accounting/receivables/receivable.entity';
import { SearchReceivablesV2Handler } from './search-receivables-v2.handler';
import { SearchReceivablesV2Query } from './search-receivables-v2.query';

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

describe('SearchReceivablesV2Handler', () => {
  let handler: SearchReceivablesV2Handler;
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([
      [
        {
          id: 'receivable-1',
          documentNumber: 'AR-001',
          customerId: 'customer-1',
          accountId: 'account-1',
          writeOffReason: 'Uncollectible',
          settledAmount: 25,
        },
      ],
      1,
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchReceivablesV2Handler,
        {
          provide: getRepositoryToken(ReceivableEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();

    handler = module.get(SearchReceivablesV2Handler);
  });

  it('scopes by organization and returns paginated full entity rows', async () => {
    const result = await handler.execute(
      new SearchReceivablesV2Query({ page: 3, limit: 5 }, actor),
    );

    expect(qb.where).toHaveBeenCalledWith(
      'receivable.organizationId = :orgId',
      { orgId: 'org-1' },
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      data: [
        {
          id: 'receivable-1',
          documentNumber: 'AR-001',
          customerId: 'customer-1',
          accountId: 'account-1',
          writeOffReason: 'Uncollectible',
          settledAmount: 25,
        },
      ],
      total: 1,
      page: 3,
      limit: 5,
    });
  });

  it('applies all requested dynamic filters', async () => {
    await handler.execute(
      new SearchReceivablesV2Query(
        {
          documentNumber: {
            operator: StringOperator.CONTAINS,
            value: 'AR',
          },
          currency: { operator: StringOperator.EQUALS, value: 'USD' },
          amount: { operator: CompareOperator.GT, value: 100 },
          settledAmount: { operator: CompareOperator.LTE, value: 50 },
          dueDate: { from: '2026-06-01', to: '2026-06-30' },
          status: { value: 'PARTIALLY_SETTLED' },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map(([clause]: [string]) => clause);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('receivable.documentNumber ILIKE'),
        expect.stringContaining('receivable.currency ='),
        expect.stringContaining('receivable.amount >'),
        expect.stringContaining('receivable.settledAmount <='),
        expect.stringContaining('receivable.dueDate >='),
        expect.stringContaining('receivable.dueDate <'),
        expect.stringContaining('receivable.status ='),
      ]),
    );
  });
});
