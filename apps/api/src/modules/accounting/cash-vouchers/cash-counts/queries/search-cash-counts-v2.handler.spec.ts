import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../../common/decorators/actor-context.decorator';
import { StringOperator } from '../../../../../common/filters/filter.dto';
import { CashCountStatus } from '../../enums';
import { CashCountEntity } from '../cash-count.entity';
import { SearchCashCountsV2Handler } from './search-cash-counts-v2.handler';
import { SearchCashCountsV2Query } from './search-cash-counts-v2.query';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function makeQb(result: [CashCountEntity[], number]) {
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

describe('SearchCashCountsV2Handler', () => {
  let handler: SearchCashCountsV2Handler;
  let qb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    qb = makeQb([
      [
        {
          id: 'count-1',
          documentNumber: 'KKQ-0001',
          purpose: 'Kiểm kê cuối ngày',
          denominations: [{ denom: 500000, count: 2 }],
        } as CashCountEntity,
      ],
      1,
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCashCountsV2Handler,
        {
          provide: getRepositoryToken(CashCountEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();

    handler = module.get(SearchCashCountsV2Handler);
  });

  it('scopes by organization, preserves entity rows, and returns the v2 envelope', async () => {
    const result = await handler.execute(
      new SearchCashCountsV2Query({ page: 2, limit: 10 }, actor),
    );

    expect(qb.where).toHaveBeenCalledWith('cashCount.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: [
        {
          id: 'count-1',
          documentNumber: 'KKQ-0001',
          purpose: 'Kiểm kê cuối ngày',
          denominations: [{ denom: 500000, count: 2 }],
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('keeps organization-only scoping parity and defaults countedAt descending', async () => {
    await handler.execute(new SearchCashCountsV2Query({}, actor));

    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'cashCount.branchId = :branchId',
      { branchId: 'branch-1' },
    );
    expect(qb.orderBy).toHaveBeenCalledWith('cashCount.countedAt', 'DESC');
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('applies the exact cash account filter', async () => {
    await handler.execute(
      new SearchCashCountsV2Query({ cashAccountId: 'acc-1' }, actor),
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      'cashCount.cashAccountId = :cashAccountId',
      { cashAccountId: 'acc-1' },
    );
  });

  it('applies countedAt, documentNumber, purpose, and status filters', async () => {
    await handler.execute(
      new SearchCashCountsV2Query(
        {
          countedAt: {
            from: '2026-06-01T00:00:00.000Z',
            to: '2026-06-09T23:59:59.999Z',
          },
          documentNumber: {
            operator: StringOperator.CONTAINS,
            value: 'KKQ',
          },
          purpose: {
            operator: StringOperator.CONTAINS,
            value: 'cuối ngày',
          },
          status: { value: CashCountStatus.POSTED },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map((call: unknown[]) => call[0]);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cashCount.documentNumber ILIKE'),
        expect.stringContaining('cashCount.purpose ILIKE'),
        expect.stringContaining('cashCount.status ='),
        expect.stringContaining('cashCount.countedAt >='),
        expect.stringContaining('cashCount.countedAt <'),
      ]),
    );
  });
});
