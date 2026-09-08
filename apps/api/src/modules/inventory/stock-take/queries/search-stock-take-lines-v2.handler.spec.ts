import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StockTakeEntity } from '../stock-take.entity';
import { StockTakeLineEntity } from '../stock-take-line.entity';
import { SearchStockTakeLinesV2Handler } from './search-stock-take-lines-v2.handler';
import { SearchStockTakeLinesV2Query } from './search-stock-take-lines-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const STOCK_TAKE_ID = '44444444-4444-4444-8444-444444444444';

/**
 * One line with every relation populated, mirroring
 * `StockTakeDetailPanel.tsx:106-139`. `countedQty` defaults to counted so
 * existing tests keep exercising the "normal" row; pass `null` to model an
 * uncounted line.
 */
function makeLine(lineNo: number, countedQty: string | null = '9.000') {
  return {
    id: `line-${lineNo}`,
    lineNo,
    itemId: `item-${lineNo}`,
    locationId: `loc-${lineNo}`,
    item: { id: `item-${lineNo}`, code: `SKU-${lineNo}`, name: `Item ${lineNo}`, unit: 'Cái' },
    location: { id: `loc-${lineNo}`, code: `A-0${lineNo}` },
    expectedQty: '10.000',
    countedQty,
    reason: 'Hao hụt',
  };
}

/**
 * Fake query builder. Row queries carry `skip`/`take`; the handler's count
 * query never calls either, so `getCount` always answers against the full
 * dataset regardless of the window requested for rows.
 *
 * `getRawOne` mirrors the production SQL's aggregate rules exactly
 * (`SUM(expected_qty)` over every row; `SUM(counted_qty)` /
 * `SUM(counted_qty - expected_qty)` filtered to rows with a non-null
 * `countedQty`) so the handler's wiring — not Postgres — is what these specs
 * exercise, matching the mock-only style of the rest of this file.
 */
function makeQb(allRows: ReturnType<typeof makeLine>[]) {
  let skipped = 0;
  let taken = allRows.length;
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn((n: number) => {
      skipped = n;
      return qb;
    }),
    take: jest.fn((n: number) => {
      taken = n;
      return qb;
    }),
    getMany: jest.fn(async () => allRows.slice(skipped, skipped + taken)),
    getCount: jest.fn(async () => allRows.length),
    getRawOne: jest.fn(async () => {
      let expectedTotal = 0;
      let countedTotal = 0;
      let varianceTotal = 0;
      for (const l of allRows) {
        const exp = Number(l.expectedQty);
        expectedTotal += exp;
        if (l.countedQty != null) {
          const cnt = Number(l.countedQty);
          countedTotal += cnt;
          varianceTotal += cnt - exp;
        }
      }
      return {
        expectedTotal: String(expectedTotal),
        countedTotal: String(countedTotal),
        varianceTotal: String(varianceTotal),
      };
    }),
  };
  return qb;
}

describe('SearchStockTakeLinesV2Handler', () => {
  let handler: SearchStockTakeLinesV2Handler;
  let stockTakeRepo: { findOne: jest.Mock };
  let builders: ReturnType<typeof makeQb>[];

  async function build(
    allRows: ReturnType<typeof makeLine>[] = [],
    stockTake: unknown = { id: STOCK_TAKE_ID },
  ) {
    builders = [];
    stockTakeRepo = { findOne: jest.fn().mockResolvedValue(stockTake) };
    const lineRepo = {
      createQueryBuilder: jest.fn(() => {
        const next = makeQb(allRows);
        builders.push(next);
        return next;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTakeLinesV2Handler,
        { provide: getRepositoryToken(StockTakeEntity), useValue: stockTakeRepo },
        { provide: getRepositoryToken(StockTakeLineEntity), useValue: lineRepo },
      ],
    }).compile();
    handler = module.get(SearchStockTakeLinesV2Handler);
  }

  it('checks the stock take exists and is in scope without dragging its lines along', async () => {
    await build();
    await handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor));

    expect(stockTakeRepo.findOne).toHaveBeenCalledWith({
      where: { id: STOCK_TAKE_ID, organizationId: 'org-1', branchId: 'branch-1' },
      loadEagerRelations: false,
    });
  });

  it('404s on a stock take outside the actor organization, before touching the lines', async () => {
    await build([], null);
    await expect(
      handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders).toHaveLength(0);
  });

  it('404s on a stock take in the same organization but a different branch', async () => {
    // Simulates the repo predicate excluding the row: same org, different
    // branch than the actor's — findOrFail's `branchId` clause means the
    // lookup resolves to nothing.
    await build([], null);
    await expect(
      handler.execute(
        new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, { ...actor, branchId: 'branch-1' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes by BOTH organizationId and branchId, matching StockTakeService.findOrFail exactly', async () => {
    await build();
    await handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor));
    const where = stockTakeRepo.findOne.mock.calls[0][0].where;
    expect(where).toEqual({ id: STOCK_TAKE_ID, organizationId: 'org-1', branchId: 'branch-1' });
  });

  it('orders by the voucher ordinal and offers no way to change it', async () => {
    await build();
    await handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor));

    expect(builders[0].orderBy).toHaveBeenCalledTimes(1);
    expect(builders[0].orderBy).toHaveBeenCalledWith('line.lineNo', 'ASC');
  });

  it('joins every relation the panel renders — item and location', async () => {
    await build();
    await handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor));

    const rowsQb = builders[0];
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.item', 'item');
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.location', 'location');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('item');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('location');
  });

  it('never lets a line come back missing a column the panel renders', async () => {
    const rows = [makeLine(1), makeLine(2)];
    await build(rows);
    const result = await handler.execute(
      new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor),
    );

    for (const line of result.data) {
      // StockTakeDetailPanel.tsx:106-139
      expect(line.item?.code).toBeDefined();
      expect(line.item?.name).toBeDefined();
      expect(line.item?.unit).toBeDefined();
      expect(line.location?.code).toBeDefined();
      expect(line.expectedQty).toBeDefined();
      expect(line.countedQty).toBeDefined();
      expect(line.reason).toBeDefined();
    }
  });

  it('paginates with the documented defaults', async () => {
    await build();
    await handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor));
    expect(builders[0].skip).toHaveBeenCalledWith(0);
    expect(builders[0].take).toHaveBeenCalledWith(50);

    await build();
    await handler.execute(
      new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, { page: 3, limit: 20 }, actor),
    );
    expect(builders[0].skip).toHaveBeenCalledWith(40);
    expect(builders[0].take).toHaveBeenCalledWith(20);
  });

  it('returns the { data, page, limit, total } envelope with total reflecting every matching row, not just the page', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => makeLine(i + 1));
    await build(rows);
    const result = await handler.execute(
      new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, { page: 2, limit: 50 }, actor),
    );

    expect(result.total).toBe(1000);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.data).toHaveLength(50);
    expect(result.data[0].lineNo).toBe(51);
    expect(result.data[49].lineNo).toBe(100);
  });

  it('windows twenty pages of a 1000-line stock take with no duplicates and no gaps', async () => {
    const allLines = Array.from({ length: 1000 }, (_, i) => makeLine(i + 1));
    const seenLineNos: number[] = [];

    for (let page = 1; page <= 20; page += 1) {
      await build(allLines);
      const result = await handler.execute(
        new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, { page, limit: 50 }, actor),
      );
      expect(result.total).toBe(1000);
      seenLineNos.push(...result.data.map((l: { lineNo: number }) => l.lineNo));
    }

    // No duplicates.
    expect(new Set(seenLineNos).size).toBe(seenLineNos.length);
    // No gaps: the union is exactly 1..1000, joined in order.
    expect(seenLineNos).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
  });

  it('AC-27: totals are identical across every page and match a hand-computed sum over ALL lines, not the page(s) loaded', async () => {
    // Mixed dataset: some lines counted, some not — same shape the FE loop
    // handles at StockTakeDetailPanel.tsx:111-125.
    const allLines = [
      ...Array.from({ length: 400 }, (_, i) => makeLine(i + 1, '9.000')),
      ...Array.from({ length: 300 }, (_, i) => makeLine(i + 401, null)),
      ...Array.from({ length: 300 }, (_, i) => makeLine(i + 701, '11.000')),
    ];
    let handComputedExpected = 0;
    let handComputedCounted = 0;
    let handComputedVariance = 0;
    for (const l of allLines) {
      const exp = Number(l.expectedQty);
      handComputedExpected += exp;
      if (l.countedQty != null) {
        const cnt = Number(l.countedQty);
        handComputedCounted += cnt;
        handComputedVariance += cnt - exp;
      }
    }

    const totalsPerPage: unknown[] = [];
    for (const page of [1, 2, 15, 20]) {
      await build(allLines);
      const result = await handler.execute(
        new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, { page, limit: 50 }, actor),
      );
      totalsPerPage.push(result.totals);
    }

    // Identical on every page — the footer never grows as more pages load.
    expect(new Set(totalsPerPage.map((t) => JSON.stringify(t))).size).toBe(1);
    expect(totalsPerPage[0]).toEqual({
      expectedTotal: handComputedExpected,
      countedTotal: handComputedCounted,
      varianceTotal: handComputedVariance,
    });
  });

  it('AC-27: a line with countedQty NULL contributes to expectedTotal but not countedTotal or varianceTotal', async () => {
    const rows = [makeLine(1, '9.000'), makeLine(2, null)];
    await build(rows);
    const result = await handler.execute(
      new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor),
    );

    // expectedTotal counts both lines (10 + 10 = 20).
    expect(result.totals.expectedTotal).toBe(20);
    // countedTotal/varianceTotal only fold in the counted line.
    expect(result.totals.countedTotal).toBe(9);
    expect(result.totals.varianceTotal).toBe(9 - 10);
  });

  it('AC-27: the totals query is separate from the rows/count queries and runs in the same Promise.all (no join on lines)', async () => {
    const rows = [makeLine(1), makeLine(2)];
    await build(rows);
    await handler.execute(new SearchStockTakeLinesV2Query(STOCK_TAKE_ID, {}, actor));

    // Three query builders: rows, count, totals — none of them adds a join
    // beyond the item/location relations rows already need.
    expect(builders).toHaveLength(3);
    const totalsQb = builders[2];
    expect(totalsQb.select).toHaveBeenCalledWith(
      expect.stringContaining('SUM'),
      'expectedTotal',
    );
    expect(totalsQb.getRawOne).toHaveBeenCalledTimes(1);
    // The totals builder never joins `line.item`/`line.location` — it has no
    // reason to touch those relations at all.
    expect(totalsQb.leftJoin).not.toHaveBeenCalled();
  });
});
