import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompareOperator, StringOperator } from '../../../common/filters/filter.dto';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { SearchInvoicesV2Handler } from './search-invoices-v2.handler';
import { SearchInvoicesV2Query } from './search-invoices-v2.query';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'cashier-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

interface FakeQb {
  leftJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  getMany: jest.Mock;
  getRawOne: jest.Mock;
}

/**
 * The handler builds the query twice — rows, then totals — so the fake
 * repository hands out a fresh builder per `createQueryBuilder` call:
 * `builders[0]` is the rows query, `builders[1]` the totals query.
 */
function makeQb(rows: unknown[], totals: { total: string; totalAmount: string }): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    leftJoin: jest.fn(self),
    where: jest.fn(self),
    andWhere: jest.fn(self),
    orderBy: jest.fn(self),
    skip: jest.fn(self),
    take: jest.fn(self),
    select: jest.fn(self),
    addSelect: jest.fn(self),
    getMany: jest.fn().mockResolvedValue(rows),
    getRawOne: jest.fn().mockResolvedValue(totals),
  });
  return qb as FakeQb;
}

describe('SearchInvoicesV2Handler', () => {
  let handler: SearchInvoicesV2Handler;
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
        SearchInvoicesV2Handler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: repo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
      ],
    }).compile();
    handler = module.get(SearchInvoicesV2Handler);
  }

  const rowsQb = () => builders[0];
  const totalsQb = () => builders[1];

  it('scopes by organizationId and active branch, orders by createdAt', async () => {
    await build();
    await handler.execute(new SearchInvoicesV2Query({}, actor));

    expect(rowsQb().where).toHaveBeenCalledWith('inv.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(rowsQb().andWhere).toHaveBeenCalledWith('inv.branchId = :branchId', {
      branchId: 'branch-1',
    });
    expect(rowsQb().orderBy).toHaveBeenCalledWith('inv.createdAt', 'DESC');
  });

  it('paginates and returns the { data, total, page, limit, totals } envelope', async () => {
    const rows = [{ id: 'inv-1', code: 'INV-1' }];
    await build(rows, { total: '12', totalAmount: '26337000' });

    const result = await handler.execute(
      new SearchInvoicesV2Query({ page: 2, limit: 20 }, actor),
    );

    expect(rowsQb().skip).toHaveBeenCalledWith(20);
    expect(rowsQb().take).toHaveBeenCalledWith(20);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(12);
    expect(result.totals.totalAmount).toBe(26337000);
  });

  describe('footer grand total', () => {
    it('sums the signed total, so refunds subtract', async () => {
      await build([], { total: '12', totalAmount: '26337000' });
      await handler.execute(new SearchInvoicesV2Query({}, actor));

      // A plain SUM(amount_due) reads 28.927.000 on the same data because
      // `computeAmountDue` clamps refunds to zero — this assertion is what
      // keeps the footer from regressing to that plausible-looking number.
      const [[sql, alias]] = totalsQb().addSelect.mock.calls as [[string, string]];
      expect(alias).toBe('totalAmount');
      expect(sql).toContain('RETURN');
      expect(sql).toContain('EXCHANGE');
      expect(sql).toContain('netAmount');
      expect(sql).toContain('amountDue');
      expect(totalsQb().select).toHaveBeenCalledWith('COUNT(*)', 'total');
    });

    it('is invariant to limit: page size never changes the grand total', async () => {
      await build([], { total: '12', totalAmount: '26337000' });
      const small = await handler.execute(new SearchInvoicesV2Query({ limit: 1 }, actor));
      const large = await handler.execute(new SearchInvoicesV2Query({ limit: 100 }, actor));

      expect(small.totals.totalAmount).toBe(large.totals.totalAmount);
      expect(small.total).toBe(large.total);
    });

    it('applies the same filters to the totals query as to the rows query', async () => {
      await build();
      await handler.execute(
        new SearchInvoicesV2Query(
          {
            code: { operator: StringOperator.CONTAINS, value: 'INV' },
            amountDue: { operator: CompareOperator.LTE, value: 500000 },
            customerId: 'cus-1',
          },
          actor,
        ),
      );

      // Bound-parameter names carry a global counter so the two builds cannot
      // collide — that uniquifier is exactly what makes building twice safe, so
      // compare the predicates with the suffix normalised away.
      const predicates = (qb: FakeQb) =>
        qb.andWhere.mock.calls.map((c: unknown[]) =>
          (c[0] as string).replace(/:p_\w+?_\d+/g, ':param'),
        );
      expect(predicates(totalsQb())).toEqual(predicates(rowsQb()));
      expect(totalsQb().where).toHaveBeenCalledWith('inv.organizationId = :orgId', {
        orgId: 'org-1',
      });
    });

    it('keeps the customer join on the totals query — three filters need its alias', async () => {
      await build();
      await handler.execute(
        new SearchInvoicesV2Query(
          { customerName: { operator: StringOperator.CONTAINS, value: 'An' } },
          actor,
        ),
      );

      // Without the join the totals query would not compile at all; it is
      // many-to-one so it cannot inflate the SUM.
      expect(totalsQb().leftJoin).toHaveBeenCalled();
    });
  });
});
