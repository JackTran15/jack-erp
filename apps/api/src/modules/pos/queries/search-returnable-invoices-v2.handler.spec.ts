import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { SearchReturnableInvoicesV2Handler } from './search-returnable-invoices-v2.handler';
import { SearchReturnableInvoicesV2Query } from './search-returnable-invoices-v2.query';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'cashier-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

interface FakeQb {
  leftJoinAndMapOne: jest.Mock;
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

function makeQb(rows: unknown[], totals: { total: string; totalAmount: string }): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    leftJoinAndMapOne: jest.fn(self),
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

describe('SearchReturnableInvoicesV2Handler', () => {
  let handler: SearchReturnableInvoicesV2Handler;
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
        SearchReturnableInvoicesV2Handler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: repo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
      ],
    }).compile();
    handler = module.get(SearchReturnableInvoicesV2Handler);
  }

  const rowsQb = () => builders[0];
  const totalsQb = () => builders[1];
  const predicates = (qb: FakeQb) =>
    qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);

  it('returns the { data, total, page, limit, totals } envelope', async () => {
    await build([{ id: 'inv-1' }], { total: '7', totalAmount: '26117000' });

    const result = await handler.execute(
      new SearchReturnableInvoicesV2Query({ page: 1, limit: 20 }, actor),
    );

    expect(result.total).toBe(7);
    expect(result.totals.totalAmount).toBe(26117000);
    expect(rowsQb().orderBy).toHaveBeenCalledWith('inv.createdAt', 'DESC');
  });

  describe('eligibility predicates reach the totals query', () => {
    /**
     * The whole point of this suite. Every predicate below narrows the row set;
     * one missing on the totals side and the footer quietly reports more than
     * the grid shows — the EXISTS in particular would start counting invoices
     * whose items have all been returned.
     */
    it('carries type, status, isDraft and the un-returned-items EXISTS', async () => {
      await build();
      await handler.execute(new SearchReturnableInvoicesV2Query({}, actor));

      const totals = predicates(totalsQb());
      expect(totals).toEqual(
        expect.arrayContaining([
          expect.stringContaining('inv.type = :type'),
          expect.stringContaining('inv.status IN (:...statuses)'),
          expect.stringContaining('inv.isDraft = false'),
          expect.stringContaining('inv.branchId = :branchId'),
        ]),
      );
      const existsClause = totals.find((sql) => sql.includes('EXISTS'));
      expect(existsClause).toContain('invoice_items');
      expect(existsClause).toContain('ii.quantity > ii.returned_quantity');
      expect(existsClause).toContain(':outDir');
    });

    it('applies exactly the same predicates on both builders', async () => {
      await build();
      await handler.execute(new SearchReturnableInvoicesV2Query({}, actor));

      // Bound-parameter names carry a global counter so two builds cannot
      // collide; normalise it away before comparing.
      const norm = (qb: FakeQb) =>
        predicates(qb).map((sql) => sql.replace(/:p_\w+?_\d+/g, ':param'));
      expect(norm(totalsQb())).toEqual(norm(rowsQb()));
    });
  });

  describe('footer grand total', () => {
    it('sums the signed total rather than amount_due', async () => {
      await build([], { total: '7', totalAmount: '26117000' });
      await handler.execute(new SearchReturnableInvoicesV2Query({}, actor));

      const [[sql, alias]] = totalsQb().addSelect.mock.calls as [[string, string]];
      expect(alias).toBe('totalAmount');
      expect(sql).toContain('RETURN');
      expect(sql).toContain('EXCHANGE');
      expect(sql).toContain('netAmount');
      expect(totalsQb().select).toHaveBeenCalledWith('COUNT(*)', 'total');
    });

    it('is invariant to limit', async () => {
      await build([], { total: '7', totalAmount: '26117000' });
      const small = await handler.execute(
        new SearchReturnableInvoicesV2Query({ limit: 1 }, actor),
      );
      const large = await handler.execute(
        new SearchReturnableInvoicesV2Query({ limit: 100 }, actor),
      );

      expect(small.totals.totalAmount).toBe(large.totals.totalAmount);
      expect(small.total).toBe(large.total);
    });
  });
});
