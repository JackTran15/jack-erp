import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { TransferOrderEntity } from '../transfer-order.entity';
import { TransferOrderLineEntity } from '../transfer-order-line.entity';
import { TransferOrderLineSearchV2Dto } from '../dto/transfer-order-line-search-v2.dto';
import { SearchTransferOrderLinesV2Handler } from './search-transfer-order-lines-v2.handler';
import { SearchTransferOrderLinesV2Query } from './search-transfer-order-lines-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-source',
  roles: [],
};

const TRANSFER_ORDER_ID = '44444444-4444-4444-8444-444444444444';

/** One line with every relation the panel renders, mirroring `TransferOrdersPage.tsx:765-782`. */
function makeLine(lineNo: number) {
  return {
    id: `line-${lineNo}`,
    lineNo,
    itemId: `item-${lineNo}`,
    item: { id: `item-${lineNo}`, code: `SKU-${lineNo}`, name: `Item ${lineNo}`, unit: 'cái' },
    sourceStorageId: 'src-storage',
    requestedQty: '10',
    note: null,
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

describe('SearchTransferOrderLinesV2Handler', () => {
  let handler: SearchTransferOrderLinesV2Handler;
  let transferOrderRepo: { findOne: jest.Mock };
  let builders: ReturnType<typeof makeQb>[];

  async function build(
    allRows: ReturnType<typeof makeLine>[] = [],
    transferOrder: unknown = {
      id: TRANSFER_ORDER_ID,
      sourceBranchId: 'branch-source',
      destinationBranchId: 'branch-destination',
    },
  ) {
    builders = [];
    transferOrderRepo = { findOne: jest.fn().mockResolvedValue(transferOrder) };
    const lineRepo = {
      createQueryBuilder: jest.fn(() => {
        const next = makeQb(allRows);
        builders.push(next);
        return next;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchTransferOrderLinesV2Handler,
        { provide: getRepositoryToken(TransferOrderEntity), useValue: transferOrderRepo },
        { provide: getRepositoryToken(TransferOrderLineEntity), useValue: lineRepo },
      ],
    }).compile();
    handler = module.get(SearchTransferOrderLinesV2Handler);
  }

  it('checks the transfer order exists in the actor organization without dragging its lines along', async () => {
    await build();
    await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, actor),
    );

    expect(transferOrderRepo.findOne).toHaveBeenCalledWith({
      where: { id: TRANSFER_ORDER_ID, organizationId: 'org-1' },
      loadEagerRelations: false,
    });
  });

  it('404s on an id outside the actor organization, before touching the lines', async () => {
    await build([], null);
    await expect(
      handler.execute(new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, actor)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders).toHaveLength(0);
  });

  it('resolves for the DESTINATION branch too — both sides of a transfer order are entitled to see it', async () => {
    await build([], {
      id: TRANSFER_ORDER_ID,
      sourceBranchId: 'branch-source',
      destinationBranchId: 'branch-destination',
    });
    await expect(
      handler.execute(
        new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, {
          ...actor,
          branchId: 'branch-destination',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('404s when the actor branch is neither the source nor the destination', async () => {
    await build([], {
      id: TRANSFER_ORDER_ID,
      sourceBranchId: 'branch-source',
      destinationBranchId: 'branch-destination',
    });
    await expect(
      handler.execute(
        new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, {
          ...actor,
          branchId: 'branch-unrelated',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders).toHaveLength(0);
  });

  it('404s when the actor carries no branch at all, matching assertParticipantBranch', async () => {
    await build([], {
      id: TRANSFER_ORDER_ID,
      sourceBranchId: 'branch-source',
      destinationBranchId: 'branch-destination',
    });
    await expect(
      handler.execute(
        new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, {
          ...actor,
          branchId: undefined,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders).toHaveLength(0);
  });

  it('orders by the voucher ordinal and offers no way to change it', async () => {
    await build();
    await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, actor),
    );

    expect(builders[0].orderBy).toHaveBeenCalledTimes(1);
    expect(builders[0].orderBy).toHaveBeenCalledWith('line.lineNo', 'ASC');
  });

  it('joins every relation the panel renders — item', async () => {
    await build();
    await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, actor),
    );

    const rowsQb = builders[0];
    expect(rowsQb.leftJoin).toHaveBeenCalledWith('line.item', 'item');
    expect(rowsQb.addSelect).toHaveBeenCalledWith('item');
  });

  it('never lets a line come back missing the columns the panel renders', async () => {
    const rows = [makeLine(1), makeLine(2)];
    await build(rows);
    const result = await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, actor),
    );

    for (const line of result.data) {
      expect(line.item?.code).toBeDefined();
      expect(line.item?.name).toBeDefined();
      expect(line.item?.unit).toBeDefined();
      expect(line.sourceStorageId).toBeDefined();
      expect(line.requestedQty).toBeDefined();
    }
  });

  it('paginates with the documented defaults', async () => {
    await build();
    await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, {}, actor),
    );
    expect(builders[0].skip).toHaveBeenCalledWith(0);
    expect(builders[0].take).toHaveBeenCalledWith(50);

    await build();
    await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, { page: 3, limit: 20 }, actor),
    );
    expect(builders[0].skip).toHaveBeenCalledWith(40);
    expect(builders[0].take).toHaveBeenCalledWith(20);
  });

  it('returns { data, page, limit, total } — 120 lines, page 1/50 gives 50 rows and total 120', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => makeLine(i + 1));
    await build(rows);
    const result = await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, { page: 1, limit: 50 }, actor),
    );

    expect(result.total).toBe(120);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.data).toHaveLength(50);
    expect(result.data[0].lineNo).toBe(1);
    expect(result.data[49].lineNo).toBe(50);
  });

  it('page 3 of a 120-line order returns the last 20 rows', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => makeLine(i + 1));
    await build(rows);
    const result = await handler.execute(
      new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, { page: 3, limit: 50 }, actor),
    );

    expect(result.total).toBe(120);
    expect(result.data).toHaveLength(20);
    expect(result.data[0].lineNo).toBe(101);
    expect(result.data[19].lineNo).toBe(120);
  });

  it('windows three pages of a 120-line order with no duplicates and no gaps', async () => {
    const allLines = Array.from({ length: 120 }, (_, i) => makeLine(i + 1));
    const seenLineNos: number[] = [];

    for (const page of [1, 2, 3]) {
      await build(allLines);
      const result = await handler.execute(
        new SearchTransferOrderLinesV2Query(TRANSFER_ORDER_ID, { page, limit: 50 }, actor),
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

/**
 * `forbidNonWhitelisted` on the global ValidationPipe means an unexpected
 * body field 400s rather than being silently dropped. The pipe isn't wired
 * in this ticket (that's T-03-03's controller), so this pins the guarantee
 * directly on the DTO the way `GoodsIssueLineDto`'s spec does.
 */
describe('TransferOrderLineSearchV2Dto — ValidationPipe contract', () => {
  const failedFields = (payload: object): string[] =>
    validateSync(plainToInstance(TransferOrderLineSearchV2Dto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).map((error) => error.property);

  it('rejects an unexpected field', () => {
    expect(failedFields({ page: 1, limit: 50, sortBy: 'itemId' })).toContain('sortBy');
  });

  it('accepts a bare { page, limit } body', () => {
    expect(failedFields({ page: 2, limit: 20 })).toEqual([]);
  });

  it('accepts an empty body — defaults apply', () => {
    expect(failedFields({})).toEqual([]);
  });
});
