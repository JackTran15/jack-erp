import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import { ExpenseEntity } from '../../accounting/expenses/expense.entity';
import { SearchExpensesV2Handler } from './search-expenses-v2.handler';
import { SearchExpensesV2Query } from './search-expenses-v2.query';

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

describe('SearchExpensesV2Handler', () => {
  let handler: SearchExpensesV2Handler;
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([
      [
        {
          id: 'expense-1',
          description: 'Office rent',
          accountId: 'account-1',
          payableId: 'payable-1',
          paymentMethod: 'PAYABLE',
          journalEntryId: 'journal-1',
        },
      ],
      1,
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchExpensesV2Handler,
        {
          provide: getRepositoryToken(ExpenseEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();

    handler = module.get(SearchExpensesV2Handler);
  });

  it('scopes by organization and returns paginated full entity rows', async () => {
    const result = await handler.execute(
      new SearchExpensesV2Query({ page: 2, limit: 20 }, actor),
    );

    expect(qb.where).toHaveBeenCalledWith('expense.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [
        {
          id: 'expense-1',
          description: 'Office rent',
          accountId: 'account-1',
          payableId: 'payable-1',
          paymentMethod: 'PAYABLE',
          journalEntryId: 'journal-1',
        },
      ],
      total: 1,
      page: 2,
      limit: 20,
    });
  });

  it('applies all requested dynamic filters', async () => {
    await handler.execute(
      new SearchExpensesV2Query(
        {
          description: {
            operator: StringOperator.CONTAINS,
            value: 'rent',
          },
          amount: { operator: CompareOperator.GTE, value: 100 },
          status: { value: 'APPROVED' },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map(([clause]: [string]) => clause);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('expense.description ILIKE'),
        expect.stringContaining('expense.amount >='),
        expect.stringContaining('expense.status ='),
      ]),
    );
  });
});
