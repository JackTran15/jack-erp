import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompareOperator, StringOperator } from '../../../../common/filters/filter.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../goods-receipt-line.entity';
import { SearchGoodsReceiptLinesV2Handler } from './search-goods-receipt-lines-v2.handler';
import { SearchGoodsReceiptLinesV2Query } from './search-goods-receipt-lines-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const RECEIPT_ID = '22222222-2222-4222-8222-222222222222';

/**
 * The handler builds the query twice per request — once for the rows, once for
 * the totals — so the fake repository hands out a fresh builder each time.
 * `builders[0]` is the rows query and `builders[1]` the totals query, and the
 * fact that both exist is the point of most of these tests: the footer numbers
 * are only trustworthy while both carry the same predicate.
 */
function makeQb(rows: unknown[], totals: Record<string, string>) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(rows),
    getRawOne: jest.fn().mockResolvedValue(totals),
  };
  return qb;
}

/**
 * SQL fragments the builder was given, flattened for substring assertions.
 *
 * Bound parameter names are normalised: `FilterBuilder` appends a global
 * counter to keep them unique, so the rows query and the totals query get
 * `:p_item_code_1` and `:p_item_code_2` for the same predicate. Comparing raw
 * strings would fail on that difference and say nothing about the thing worth
 * checking, which is that both queries filter the same column the same way.
 */
const fragments = (qb: any): string[] =>
  [...qb.where.mock.calls, ...qb.andWhere.mock.calls].map((call: unknown[]) =>
    String(call[0]).replace(/(:[A-Za-z0-9_]*?)_\d+\b/g, '$1_N'),
  );

describe('SearchGoodsReceiptLinesV2Handler', () => {
  let handler: SearchGoodsReceiptLinesV2Handler;
  let builders: ReturnType<typeof makeQb>[];
  let receiptRepo: { findOne: jest.Mock };

  async function build(
    rows: unknown[] = [],
    totals = { total: '0', totalQuantity: '0', totalAmount: '0' },
    receipt: unknown = { id: RECEIPT_ID },
  ) {
    builders = [];
    receiptRepo = { findOne: jest.fn().mockResolvedValue(receipt) };
    const lineRepo = {
      createQueryBuilder: jest.fn(() => {
        const next = makeQb(rows, totals);
        builders.push(next);
        return next;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchGoodsReceiptLinesV2Handler,
        { provide: getRepositoryToken(GoodsReceiptEntity), useValue: receiptRepo },
        { provide: getRepositoryToken(GoodsReceiptLineEntity), useValue: lineRepo },
      ],
    }).compile();
    handler = module.get(SearchGoodsReceiptLinesV2Handler);
  }

  const rowsQb = () => builders[0];
  const totalsQb = () => builders[1];

  it('checks the voucher exists and is in scope without dragging its lines along', async () => {
    await build();
    await handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor));

    expect(receiptRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: RECEIPT_ID,
        organizationId: 'org-1',
        branchId: 'branch-1',
      },
      // The whole point of this endpoint is not shipping every line; proving the
      // voucher exists must not pull them either.
      loadEagerRelations: false,
    });
  });

  it('404s on a voucher outside the actor scope, before touching the lines', async () => {
    await build([], undefined, null);
    await expect(
      handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders).toHaveLength(0);
  });

  it('omits the branch predicate when the actor has no active branch', async () => {
    await build();
    await handler.execute(
      new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, { ...actor, branchId: undefined }),
    );
    expect(receiptRepo.findOne.mock.calls[0][0].where).not.toHaveProperty('branchId');
  });

  it('keeps the line-level organization filter the replaced getLines had', async () => {
    await build();
    await handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor));

    // goods_receipt_lines carries its own organization_id and the old getLines
    // filtered on it. Redundant with the parent check in practice — but dropping
    // a tenancy filter because it looks redundant is how tenancy filters vanish.
    const sql = fragments(rowsQb()).join(' | ');
    expect(sql).toContain('line.organizationId = :orgId');
    expect(fragments(totalsQb()).join(' | ')).toContain('line.organizationId = :orgId');
  });

  it('orders by the voucher ordinal and offers no way to change it', async () => {
    await build();
    await handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor));

    expect(rowsQb().orderBy).toHaveBeenCalledTimes(1);
    expect(rowsQb().orderBy).toHaveBeenCalledWith('line.lineNo', 'ASC');
  });

  it('joins the item on both queries so the string filters and the grid agree', async () => {
    await build();
    await handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor));

    expect(rowsQb().leftJoin).toHaveBeenCalledWith('line.item', 'item');
    expect(totalsQb().leftJoin).toHaveBeenCalledWith('line.item', 'item');
    // Eager relations are ignored by the query builder; the grid needs these.
    expect(rowsQb().leftJoinAndSelect).toHaveBeenCalledWith('line.location', 'location');
    expect(rowsQb().addSelect).toHaveBeenCalledWith('item');
  });

  it('paginates with the documented defaults', async () => {
    await build();
    await handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor));
    expect(rowsQb().skip).toHaveBeenCalledWith(0);
    expect(rowsQb().take).toHaveBeenCalledWith(50);

    await build();
    await handler.execute(
      new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, { page: 3, limit: 20 }, actor),
    );
    expect(rowsQb().skip).toHaveBeenCalledWith(40);
    expect(rowsQb().take).toHaveBeenCalledWith(20);
  });

  it('windows three pages of a 120-line voucher without overlap or gap', async () => {
    // The "merge three pages and get 120 distinct lines" property is a database
    // fact and was verified live against erp_dev in T-05-02; a mocked repository
    // cannot prove it. What a mock CAN pin down is the arithmetic that produces
    // the windows, which is where an off-by-one would come from.
    const windows: [number, number][] = [];
    for (const page of [1, 2, 3]) {
      await build();
      await handler.execute(
        new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, { page, limit: 50 }, actor),
      );
      windows.push([
        rowsQb().skip.mock.calls[0][0],
        rowsQb().take.mock.calls[0][0],
      ]);
    }

    expect(windows).toEqual([
      [0, 50],
      [50, 50],
      [100, 50],
    ]);
    // Each window starts exactly where the previous one ended.
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i][0]).toBe(windows[i - 1][0] + windows[i - 1][1]);
    }
  });

  it('maps every filter to the column the grid header shows, with the operator it shows', async () => {
    await build();
    await handler.execute(
      new SearchGoodsReceiptLinesV2Query(
        RECEIPT_ID,
        {
          itemCode: { operator: StringOperator.CONTAINS, value: 'ABA' },
          itemName: { operator: StringOperator.CONTAINS, value: 'Sapo' },
          quantity: { operator: CompareOperator.LTE, value: 5 },
          unitPrice: { operator: CompareOperator.LTE, value: 1000 },
          lineTotal: { operator: CompareOperator.LTE, value: 2000 },
        },
        actor,
      ),
    );

    const sql = fragments(rowsQb()).join(' | ');
    expect(sql).toContain('item.code ILIKE');
    expect(sql).toContain('item.name ILIKE');
    expect(sql).toContain('line.quantity <=');
    expect(sql).toContain('line.unit_price <=');
    // Thành tiền filters on the product the cell renders, not on the stored
    // line_total column — see LINE_AMOUNT_EXPRESSION.
    expect(sql).toContain('line.quantity * line.unit_price <=');
  });

  it('applies the same predicate to the totals query as to the rows query', async () => {
    await build();
    await handler.execute(
      new SearchGoodsReceiptLinesV2Query(
        RECEIPT_ID,
        { itemCode: { operator: StringOperator.CONTAINS, value: 'ABA' } },
        actor,
      ),
    );

    // Not a stylistic check. If the totals query ever loses a filter the rows
    // query has, the footer silently reports the whole voucher while the grid
    // shows three lines, and nothing in the response says so (ADR-08).
    expect(fragments(totalsQb())).toEqual(fragments(rowsQb()));
    expect(fragments(totalsQb()).join(' | ')).toContain('item.code ILIKE');
  });

  it('sums quantity and the rendered amount over the filtered set, not the voucher', async () => {
    await build();
    await handler.execute(new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, {}, actor));

    expect(totalsQb().select).toHaveBeenCalledWith('COUNT(*)', 'total');
    expect(totalsQb().addSelect).toHaveBeenCalledWith(
      'COALESCE(SUM(line.quantity), 0)',
      'totalQuantity',
    );
    expect(totalsQb().addSelect).toHaveBeenCalledWith(
      'COALESCE(SUM(line.quantity * line.unit_price), 0)',
      'totalAmount',
    );
    // The totals query must never take the page window, or the footer would
    // total one page.
    expect(totalsQb().skip).not.toHaveBeenCalled();
    expect(totalsQb().take).not.toHaveBeenCalled();
  });

  it('returns the { data, total, page, limit, totals } envelope with numbers, not strings', async () => {
    const rows = [{ id: 'l-1', lineNo: 1 }];
    await build(rows, { total: '120', totalQuantity: '120', totalAmount: '120000' });
    const result = await handler.execute(
      new SearchGoodsReceiptLinesV2Query(RECEIPT_ID, { page: 2, limit: 50 }, actor),
    );

    expect(result).toEqual({
      data: rows,
      total: 120,
      page: 2,
      limit: 50,
      totals: { totalQuantity: 120, totalAmount: 120000 },
    });
  });

  it('reports an empty match as zeroes rather than failing', async () => {
    await build([], { total: '0', totalQuantity: '0', totalAmount: '0' });
    const result = await handler.execute(
      new SearchGoodsReceiptLinesV2Query(
        RECEIPT_ID,
        { itemCode: { operator: StringOperator.CONTAINS, value: 'no-such-sku' } },
        actor,
      ),
    );
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totals).toEqual({ totalQuantity: 0, totalAmount: 0 });
  });
});
