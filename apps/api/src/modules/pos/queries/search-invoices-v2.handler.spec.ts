import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompareOperator, StringOperator } from '../../../common/filters/filter.dto';
import { CustomerEntity } from '../../customer/customer.entity';
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
  let customerRepo: { find: jest.Mock };

  async function build(
    rows: unknown[] = [],
    totals: { total: string; totalAmount: string } = { total: '0', totalAmount: '0' },
    customers: unknown[] = [],
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
    customerRepo = { find: jest.fn().mockResolvedValue(customers) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchInvoicesV2Handler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: repo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(CustomerEntity), useValue: customerRepo },
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
  /**
   * The grid used to resolve customers one id at a time from the browser — up to
   * 100 extra HTTP calls for a 100-row page. These tests hold the line on the
   * replacement: one page-scoped query, four columns, nothing more.
   */
  describe('inline customer', () => {
    const CUS_A = { id: 'cus-1', code: 'KH000001', name: 'Chi Vy', phone: '0900000001' };
    const CUS_B = { id: 'cus-2', code: 'KH000002', name: 'Chi Hoa', phone: '0900000002' };

    const customerOf = (result: { data: unknown[] }, index: number) =>
      (result.data[index] as { customer: unknown }).customer;

    it('attaches each invoice its own customer, keyed by customerId', async () => {
      const rows = [
        { id: 'inv-1', code: 'INV-1', customerId: 'cus-1' },
        { id: 'inv-2', code: 'INV-2', customerId: 'cus-2' },
      ];
      await build(rows, { total: '2', totalAmount: '0' }, [CUS_A, CUS_B]);

      const result = await handler.execute(new SearchInvoicesV2Query({}, actor));

      expect(customerOf(result, 0)).toEqual(CUS_A);
      expect(customerOf(result, 1)).toEqual(CUS_B);
    });

    it('sets customer to null on a walk-in invoice, and does not throw', async () => {
      const rows = [{ id: 'inv-1', code: 'INV-1', customerId: null }];
      await build(rows, { total: '1', totalAmount: '0' }, []);

      const result = await handler.execute(new SearchInvoicesV2Query({}, actor));

      // Explicitly null, not undefined: the key has to survive JSON so the client
      // can tell "no customer" from "field missing".
      expect(customerOf(result, 0)).toBeNull();
      expect(
        Object.prototype.hasOwnProperty.call(result.data[0], 'customer'),
      ).toBe(true);
    });

    it('sets customer to null when the id matches no row of this organization', async () => {
      const rows = [{ id: 'inv-1', code: 'INV-1', customerId: 'cus-from-other-org' }];
      await build(rows, { total: '1', totalAmount: '0' }, []);

      const result = await handler.execute(new SearchInvoicesV2Query({}, actor));

      expect(customerOf(result, 0)).toBeNull();
    });

    it('projects exactly id, code, name and phone — no national id, address or notes', async () => {
      const rows = [{ id: 'inv-1', code: 'INV-1', customerId: 'cus-1' }];
      await build(rows, { total: '1', totalAmount: '0' }, [CUS_A]);

      await handler.execute(new SearchInvoicesV2Query({}, actor));

      // CustomerEntity also carries nationalId, birthDate, address, taxCode and
      // internal notes. `leftJoinAndMapOne` would ship all of them, and this
      // endpoint is reachable by any authenticated user of the organization —
      // so the projection is the guard, and this assertion is what keeps it.
      const [options] = customerRepo.find.mock.calls[0] as [
        { select: string[] },
      ];
      expect(options.select).toEqual(['id', 'code', 'name', 'phone']);
    });

    it('scopes the customer read by organizationId', async () => {
      const rows = [{ id: 'inv-1', code: 'INV-1', customerId: 'cus-1' }];
      await build(rows, { total: '1', totalAmount: '0' }, [CUS_A]);

      await handler.execute(new SearchInvoicesV2Query({}, actor));

      const [options] = customerRepo.find.mock.calls[0] as [
        { where: { organizationId: string } },
      ];
      expect(options.where.organizationId).toBe('org-1');
    });

    it('reads customers once per page, not once per row', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        id: `inv-${i}`,
        code: `INV-${i}`,
        customerId: `cus-${i}`,
      }));
      await build(rows, { total: '10', totalAmount: '0' }, []);

      await handler.execute(new SearchInvoicesV2Query({ limit: 10 }, actor));

      expect(customerRepo.find).toHaveBeenCalledTimes(1);
    });

    it('does not query at all when no row on the page has a customer', async () => {
      const rows = [
        { id: 'inv-1', code: 'INV-1', customerId: null },
        { id: 'inv-2', code: 'INV-2', customerId: null },
      ];
      await build(rows, { total: '2', totalAmount: '0' }, []);

      const result = await handler.execute(new SearchInvoicesV2Query({}, actor));

      expect(customerRepo.find).not.toHaveBeenCalled();
      expect(customerOf(result, 0)).toBeNull();
      expect(customerOf(result, 1)).toBeNull();
    });

    it('does not filter customers by status — merged and inactive ones still show', async () => {
      const rows = [{ id: 'inv-1', code: 'INV-1', customerId: 'cus-1' }];
      await build(rows, { total: '1', totalAmount: '0' }, [CUS_A]);

      await handler.execute(new SearchInvoicesV2Query({}, actor));

      // An old invoice of a since-merged customer must keep showing that name.
      const [options] = customerRepo.find.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(Object.keys(options.where).sort()).toEqual(['id', 'organizationId']);
    });
  });
});
