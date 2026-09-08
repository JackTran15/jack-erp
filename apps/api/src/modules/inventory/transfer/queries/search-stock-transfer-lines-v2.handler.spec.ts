import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StockTransferEntity } from '../stock-transfer.entity';
import { StockTransferLineEntity } from '../stock-transfer-line.entity';
import { SearchStockTransferLinesV2Handler } from './search-stock-transfer-lines-v2.handler';
import { SearchStockTransferLinesV2Query } from './search-stock-transfer-lines-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const TRANSFER_ID = '33333333-3333-4333-8333-333333333333';

/** One line with every relation populated, mirroring `StockTransferPage.tsx:665`. */
function makeLine(lineNo: number) {
  return {
    id: `line-${lineNo}`,
    lineNo,
    item: { id: `item-${lineNo}`, code: `SKU-${lineNo}`, name: `Item ${lineNo}` },
    sourceStorage: { id: 'src-storage', name: 'Kho A' },
    destinationStorage: { id: 'dst-storage', name: 'Kho B' },
    sourceLocation: { id: 'src-loc', code: 'A-01' },
    destinationLocation: { id: 'dst-loc', code: 'B-01' },
    quantity: 10,
    unitPrice: '1000',
    lineValue: '10000',
    notes: null,
  };
}

/**
 * Fake query builder. Row queries carry `skip`/`take`; the handler's count
 * query never calls either, so `getCount` always answers against the full
 * dataset regardless of the window requested for rows.
 */
function makeQb(allRows: ReturnType<typeof makeLine>[]) {
  let skipped = 0;
  let taken = allRows.length;
  const qb: any = {
    leftJoin: jest.fn(() => qb),
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
  };
  return qb;
}

describe('SearchStockTransferLinesV2Handler', () => {
  let handler: SearchStockTransferLinesV2Handler;
  let transferRepo: { findOne: jest.Mock };
  let builders: ReturnType<typeof makeQb>[];

  async function build(
    allRows: ReturnType<typeof makeLine>[] = [],
    transfer: unknown = { id: TRANSFER_ID },
  ) {
    builders = [];
    transferRepo = { findOne: jest.fn().mockResolvedValue(transfer) };
    const lineRepo = {
      createQueryBuilder: jest.fn(() => {
        const next = makeQb(allRows);
        builders.push(next);
        return next;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTransferLinesV2Handler,
        { provide: getRepositoryToken(StockTransferEntity), useValue: transferRepo },
        { provide: getRepositoryToken(StockTransferLineEntity), useValue: lineRepo },
      ],
    }).compile();
    handler = module.get(SearchStockTransferLinesV2Handler);
  }

  it('checks the transfer exists and is in scope without dragging its lines along', async () => {
    await build();
    await handler.execute(new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, actor));

    expect(transferRepo.findOne).toHaveBeenCalledWith({
      where: { id: TRANSFER_ID, organizationId: 'org-1' },
      loadEagerRelations: false,
    });
  });

  it('404s on a transfer outside the actor organization, before touching the lines', async () => {
    await build([], null);
    await expect(
      handler.execute(new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, actor)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders).toHaveLength(0);
  });

  it('scopes strictly by organizationId, matching StockTransferService.getById — no branchId predicate', async () => {
    await build();
    // Same org, DIFFERENT branch than the actor's — this must still resolve,
    // because getById never filters on branch. Tightening this would 404 an
    // inter-branch transfer for the person who created it.
    await handler.execute(
      new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, { ...actor, branchId: 'some-other-branch' }),
    );
    const where = transferRepo.findOne.mock.calls[0][0].where;
    expect(where).toEqual({ id: TRANSFER_ID, organizationId: 'org-1' });
    expect(where).not.toHaveProperty('branchId');
  });

  it('orders by the voucher ordinal and offers no way to change it', async () => {
    await build();
    await handler.execute(new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, actor));

    expect(builders[0].orderBy).toHaveBeenCalledTimes(1);
    expect(builders[0].orderBy).toHaveBeenCalledWith('line.lineNo', 'ASC');
  });

  it('joins every relation the panel renders — item, both storages, both locations', async () => {
    await build();
    await handler.execute(new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, actor));

    const rowsQb = builders[0];
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.item', 'item');
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.sourceStorage', 'sourceStorage');
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.destinationStorage', 'destinationStorage');
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.sourceLocation', 'sourceLocation');
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.destinationLocation', 'destinationLocation');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('item');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('sourceStorage');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('destinationStorage');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('sourceLocation');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('destinationLocation');
  });

  it('never lets a line come back missing its source or destination storage/location', async () => {
    const rows = [makeLine(1), makeLine(2)];
    await build(rows);
    const result = await handler.execute(
      new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, actor),
    );

    for (const line of result.data) {
      expect(line.item).toBeDefined();
      expect(line.sourceStorage).toBeDefined();
      expect(line.destinationStorage).toBeDefined();
      expect(line.sourceLocation).toBeDefined();
      expect(line.destinationLocation).toBeDefined();
    }
  });

  it('paginates with the documented defaults', async () => {
    await build();
    await handler.execute(new SearchStockTransferLinesV2Query(TRANSFER_ID, {}, actor));
    expect(builders[0].skip).toHaveBeenCalledWith(0);
    expect(builders[0].take).toHaveBeenCalledWith(50);

    await build();
    await handler.execute(
      new SearchStockTransferLinesV2Query(TRANSFER_ID, { page: 3, limit: 20 }, actor),
    );
    expect(builders[0].skip).toHaveBeenCalledWith(40);
    expect(builders[0].take).toHaveBeenCalledWith(20);
  });

  it('returns the { data, page, limit, total } envelope with total reflecting every matching row, not just the page', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => makeLine(i + 1));
    await build(rows);
    const result = await handler.execute(
      new SearchStockTransferLinesV2Query(TRANSFER_ID, { page: 2, limit: 50 }, actor),
    );

    expect(result.total).toBe(120);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.data).toHaveLength(50);
    expect(result.data[0].lineNo).toBe(51);
    expect(result.data[49].lineNo).toBe(100);
  });

  it('windows three pages of a 120-line transfer with no duplicates and no gaps', async () => {
    const allLines = Array.from({ length: 120 }, (_, i) => makeLine(i + 1));
    const seenLineNos: number[] = [];

    for (const page of [1, 2, 3]) {
      await build(allLines);
      const result = await handler.execute(
        new SearchStockTransferLinesV2Query(TRANSFER_ID, { page, limit: 50 }, actor),
      );
      expect(result.total).toBe(120);
      seenLineNos.push(...result.data.map((l: { lineNo: number }) => l.lineNo));
    }

    // No duplicates.
    expect(new Set(seenLineNos).size).toBe(seenLineNos.length);
    // No gaps: the union is exactly 1..120, joined in order.
    expect(seenLineNos).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
  });
});
