import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StringOperator, CompareOperator } from '../../../../common/filters/filter.dto';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import { SearchGoodsReceiptsV2Handler } from './search-goods-receipts-v2.handler';
import { SearchGoodsReceiptsV2Query } from './search-goods-receipts-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

interface FakeQb {
  leftJoinAndSelect: jest.Mock;
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
 * The handler builds the query twice — once for rows, once for totals — so the
 * fake repository hands out a fresh builder per `createQueryBuilder` call and
 * records them in order: [0] = rows, [1] = totals.
 */
function makeQb(rows: unknown[], totals: { total: string; totalAmount: string }): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    leftJoinAndSelect: jest.fn(self),
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

describe('SearchGoodsReceiptsV2Handler', () => {
  let handler: SearchGoodsReceiptsV2Handler;
  let builders: FakeQb[];

  async function build(
    rows: unknown[],
    totals: { total: string; totalAmount: string } = { total: '0', totalAmount: '0' },
  ) {
    builders = [];
    const repo = {
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb(rows, totals);
        builders.push(qb);
        return qb;
      }),
      manager: {},
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchGoodsReceiptsV2Handler,
        { provide: getRepositoryToken(GoodsReceiptEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchGoodsReceiptsV2Handler);
  }

  const rowsQb = () => builders[0];
  const totalsQb = () => builders[1];

  it('scopes by organizationId and active branch, and joins provider + lines', async () => {
    await build([]);
    await handler.execute(new SearchGoodsReceiptsV2Query({}, actor));

    expect(rowsQb().where).toHaveBeenCalledWith('gr.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(rowsQb().andWhere).toHaveBeenCalledWith('gr.branchId = :branchId', {
      branchId: 'branch-1',
    });
    expect(rowsQb().leftJoinAndSelect).toHaveBeenCalledWith('gr.provider', 'provider');
    expect(rowsQb().leftJoinAndSelect).toHaveBeenCalledWith('gr.lines', 'lines');
    expect(rowsQb().orderBy).toHaveBeenCalledWith('gr.receivedAt', 'DESC');
  });

  it('returns the eager rows unchanged in the { data, total, page, limit } envelope', async () => {
    const rows = [
      {
        id: 'gr-1',
        documentNumber: 'PNK-1',
        provider: { id: 'pv-1', name: 'Acme' },
        lines: [{ quantity: '2', unitPrice: '1000' }],
      },
    ];
    await build(rows, { total: '7', totalAmount: '2000' });
    const result = await handler.execute(
      new SearchGoodsReceiptsV2Query({ page: 3, limit: 5 }, actor),
    );
    expect(rowsQb().skip).toHaveBeenCalledWith(10);
    expect(rowsQb().take).toHaveBeenCalledWith(5);
    expect(result.data).toBe(rows);
    expect(result.total).toBe(7);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });

  it('applies documentNumber, party and totalAmount filters', async () => {
    await build([]);
    await handler.execute(
      new SearchGoodsReceiptsV2Query(
        {
          documentNumber: { operator: StringOperator.CONTAINS, value: 'PNK' },
          party: { operator: StringOperator.CONTAINS, value: 'Acme' },
          totalAmount: { operator: CompareOperator.LTE, value: 2000000 },
        },
        actor,
      ),
    );

    const andWhereSql = rowsQb().andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('gr.documentNumber ILIKE'),
        // Party filter resolves the đối tượng name across all 3 kinds.
        expect.stringContaining('gr.counterparty_kind'),
        expect.stringContaining('SUM(l.quantity * l.unit_price)'),
      ]),
    );
  });

  describe('footer grand total', () => {
    it('reads totalAmount from a second query over the whole filtered set', async () => {
      await build([{ id: 'gr-1' }], { total: '14', totalAmount: '4141161000' });
      const result = await handler.execute(new SearchGoodsReceiptsV2Query({}, actor));

      expect(result.totals.totalAmount).toBe(4141161000);
      expect(result.total).toBe(14);
      expect(totalsQb().select).toHaveBeenCalledWith('COUNT(*)', 'total');
      expect(totalsQb().addSelect).toHaveBeenCalledWith(
        expect.stringContaining('SUM(l.quantity * l.unit_price)'),
        'totalAmount',
      );
    });

    it('never joins lines in the totals query — a 5-line receipt must count once', async () => {
      await build([], { total: '1', totalAmount: '5000' });
      await handler.execute(new SearchGoodsReceiptsV2Query({}, actor));

      // Joining a one-to-many `lines` here would multiply each receipt by its
      // line count and inflate the SUM behind the footer.
      expect(totalsQb().leftJoinAndSelect).not.toHaveBeenCalled();
    });

    it('is invariant to limit: page size never changes the grand total', async () => {
      await build([], { total: '14', totalAmount: '4141161000' });
      const small = await handler.execute(
        new SearchGoodsReceiptsV2Query({ limit: 1 }, actor),
      );
      const large = await handler.execute(
        new SearchGoodsReceiptsV2Query({ limit: 100 }, actor),
      );

      expect(small.totals.totalAmount).toBe(large.totals.totalAmount);
      expect(small.total).toBe(large.total);
    });

    it('applies the same filters to the totals query as to the rows query', async () => {
      await build([]);
      await handler.execute(
        new SearchGoodsReceiptsV2Query(
          { totalAmount: { operator: CompareOperator.LTE, value: 2000000 } },
          actor,
        ),
      );

      const rowsSql = rowsQb().andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
      const totalsSql = totalsQb().andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(totalsSql).toHaveLength(rowsSql.length);
      expect(totalsQb().where).toHaveBeenCalledWith('gr.organizationId = :orgId', {
        orgId: 'org-1',
      });
    });
  });
});
