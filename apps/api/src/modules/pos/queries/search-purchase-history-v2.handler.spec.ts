import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompareOperator } from '../../../common/filters/filter.dto';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { SearchPurchaseHistoryV2Handler } from './search-purchase-history-v2.handler';
import { SearchPurchaseHistoryV2Query } from './search-purchase-history-v2.query';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'cashier-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const customerId = '11111111-1111-4111-8111-111111111111';

interface FakeQb {
  leftJoinAndMapOne: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  getMany: jest.Mock;
  getRawOne: jest.Mock;
}

function makeQb(rows: unknown[], totals: { total: string; totalAmount: string }): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    leftJoinAndMapOne: jest.fn(self),
    where: jest.fn(self),
    andWhere: jest.fn(self),
    orderBy: jest.fn(self),
    addOrderBy: jest.fn(self),
    skip: jest.fn(self),
    take: jest.fn(self),
    select: jest.fn(self),
    addSelect: jest.fn(self),
    getMany: jest.fn().mockResolvedValue(rows),
    getRawOne: jest.fn().mockResolvedValue(totals),
  });
  return qb as FakeQb;
}

describe('SearchPurchaseHistoryV2Handler', () => {
  let handler: SearchPurchaseHistoryV2Handler;
  let builders: FakeQb[];

  async function build(
    rows: unknown[] = [],
    totals: { total: string; totalAmount: string } = { total: '0', totalAmount: '0' },
  ) {
    builders = [];
    const repo = {
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb(rows, totals);
        builders.push(qb);
        return qb;
      }),
    };
    const itemRepo = { find: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPurchaseHistoryV2Handler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: repo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
      ],
    }).compile();
    handler = module.get(SearchPurchaseHistoryV2Handler);
  }

  const rowsQb = () => builders[0];
  const totalsQb = () => builders[1];
  const predicates = (qb: FakeQb) =>
    qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);

  it('returns the { data, total, page, limit, totals } envelope', async () => {
    await build([{ id: 'inv-1' }], { total: '9', totalAmount: '12500000' });

    const result = await handler.execute(
      new SearchPurchaseHistoryV2Query({ customerId, page: 1, limit: 20 }, actor),
    );

    expect(result.total).toBe(9);
    expect(result.totals.totalAmount).toBe(12500000);
    expect(rowsQb().orderBy).toHaveBeenCalledWith('inv.issuedAt', 'DESC');
  });

  describe('status whitelist', () => {
    /**
     * This used to live in the frontend mapper, which dropped rows *after* the
     * request: the "Tổng hóa đơn: N" count came from the server (all statuses)
     * while the money footer summed only the rows that survived. Both builders
     * must carry it or the same split reopens between grid and footer.
     */
    it('is on both builders, with the four real-transaction statuses', async () => {
      await build();
      await handler.execute(new SearchPurchaseHistoryV2Query({ customerId }, actor));

      for (const qb of [rowsQb(), totalsQb()]) {
        expect(qb.andWhere).toHaveBeenCalledWith(
          'inv.status IN (:...historyStatuses)',
          { historyStatuses: ['paid', 'debt', 'partial_debt', 'cancelled'] },
        );
        expect(predicates(qb)).toEqual(
          expect.arrayContaining([expect.stringContaining('inv.isDraft = false')]),
        );
      }
    });
  });

  describe('footer grand total', () => {
    it('sums the signed total, so refunds subtract', async () => {
      await build([], { total: '9', totalAmount: '12500000' });
      await handler.execute(new SearchPurchaseHistoryV2Query({ customerId }, actor));

      const [[sql, alias]] = totalsQb().addSelect.mock.calls as [[string, string]];
      expect(alias).toBe('totalAmount');
      expect(sql).toContain('RETURN');
      expect(sql).toContain('EXCHANGE');
      expect(sql).toContain('netAmount');
      expect(totalsQb().select).toHaveBeenCalledWith('COUNT(*)', 'total');
    });

    it('is invariant to limit', async () => {
      await build([], { total: '9', totalAmount: '12500000' });
      const small = await handler.execute(
        new SearchPurchaseHistoryV2Query({ customerId, limit: 1 }, actor),
      );
      const large = await handler.execute(
        new SearchPurchaseHistoryV2Query({ customerId, limit: 100 }, actor),
      );

      expect(small.totals.totalAmount).toBe(large.totals.totalAmount);
      expect(small.total).toBe(large.total);
    });

    it('applies exactly the same predicates on both builders', async () => {
      await build();
      await handler.execute(
        new SearchPurchaseHistoryV2Query(
          {
            customerId,
            totalAmount: { operator: CompareOperator.LTE, value: 500000 },
          },
          actor,
        ),
      );

      const norm = (qb: FakeQb) =>
        predicates(qb).map((sql) => sql.replace(/:p_\w+?_\d+/g, ':param'));
      expect(norm(totalsQb())).toEqual(norm(rowsQb()));
    });
  });

  describe('"Tổng thanh toán" filter matches the column it filters', () => {
    /**
     * It used to compare `inv.totalPaid` — money actually collected — while the
     * column renders the invoice total. A debt invoice showing 1.000.000 has
     * `total_paid = 0`, so it passed every `≤ X` the cashier typed.
     */
    it('filters the signed total expression, never inv.totalPaid', async () => {
      await build();
      await handler.execute(
        new SearchPurchaseHistoryV2Query(
          {
            customerId,
            totalAmount: { operator: CompareOperator.LTE, value: 500000 },
          },
          actor,
        ),
      );

      const all = predicates(rowsQb()).join(' | ');
      expect(all).not.toContain('totalPaid');
      const compare = predicates(rowsQb()).find((sql) => sql.includes('<='));
      expect(compare).toContain('RETURN');
      expect(compare).toContain('netAmount');
      expect(compare).toContain('amountDue');
    });
  });
});
