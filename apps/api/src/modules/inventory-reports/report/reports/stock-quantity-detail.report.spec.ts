import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockPeriodRow } from '../../services/stock-period.service';
import { StockQuantityDetailReport } from './stock-quantity-detail.report';

// An empty category tree: these specs scope by branch and period, never by group,
// so `resolveDescendantCategoryIds` short-circuits on an absent `categoryId`.
const categories = { find: jest.fn().mockResolvedValue([]) };


const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

const engineRow: StockPeriodRow = {
  itemId: 'item-1',
  sku: 'SKU-1',
  itemName: 'Item 1',
  parentSku: null,
  parentName: null,
  unit: 'Cái',
  categoryId: 'cat-1',
  categoryName: 'Nhóm A',
  brand: 'Lasta',
  color: null,
  size: null,
  branchId: 'b1',
  branchCode: null,
  branchName: 'CN 1',
  openingQty: 10,
  openingValue: 0,
  inQty: 9,
  inValue: 0,
  outQty: 4,
  outValue: 0,
  closingQty: 15,
  closingValue: 0,
  transferOutQty: 0,
  transferOutValue: 0,
  incomingQty: 0,
  incomingValue: 0,
  inQtyPurchase: 5,
  inQtyTransferIn: 2,
  inQtyReturn: 1,
  inQtyAdjustIn: 1,
  outQtySale: 3,
  outQtyTransferOut: 1,
  outQtyAdjustOut: 0,
};

const BREAKDOWN_KEYS = [
  'openingQty', 'inQty', 'inQtyPurchase', 'inQtyTransferIn', 'inQtyReturn',
  'inQtyAdjustIn', 'outQty', 'outQtySale', 'outQtyTransferOut',
  'outQtyAdjustOut', 'closingQty',
] as const;

function build(rows: StockPeriodRow[], total = rows.length) {
  const engine = {
    // Stands in for SQL: one page, plus the whole-set count and totals.
    aggregate: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = {};
      for (const key of BREAKDOWN_KEYS) {
        totals[key] = rows.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
      }
      return Promise.resolve({ data: rows.slice(offset, offset + pageSize), total, totals });
    }),
  };
  const repo = { find: jest.fn().mockResolvedValue([]) };
  return {
    report: new StockQuantityDetailReport(engine as never, repo as never, repo as never, categories as never),
    engine,
  };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-stock-quantity-detail',
  columns: [
    'sku', 'openingQty', 'inTotal', 'inPurchase', 'inTransfer', 'inReturn',
    'inWh', 'inAdjust', 'inOther', 'outTotal', 'outSale', 'outTransfer',
    'outPurchaseReturn', 'outWh', 'outAdjust', 'outVoid', 'outOther', 'endingQty',
  ],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('StockQuantityDetailReport', () => {
  it('requests the breakdown from the engine', async () => {
    const { report, engine } = build([]);
    await report.buildData(dto, actor);
    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ includeBreakdown: true, groupBy: 'item_location' }),
    );
  });

  it('maps breakdown columns and nulls subtypes with no backing source', async () => {
    const { report } = build([engineRow]);
    const result = await report.buildData(dto, actor);
    expect(result.rows[0]).toEqual({
      sku: 'SKU-1',
      openingQty: 10,
      inTotal: 9,
      inPurchase: 5,
      inTransfer: 2,
      inReturn: 1,
      inWh: null,
      inAdjust: 1,
      inOther: null,
      outTotal: 4,
      outSale: 3,
      outTransfer: 1,
      outPurchaseReturn: null,
      outWh: null,
      outAdjust: 0,
      outVoid: null,
      outOther: null,
      endingQty: 15,
    });
    // Null-valued numeric columns total to 0-sum of nulls → stays numeric 0;
    // they must not fabricate values in rows themselves (asserted above).
    expect(result.totals!.inTotal).toBe(9);
  });

  it('answers a page of an over-cap organisation instead of refusing (AC-22)', async () => {
    const { report } = build([engineRow], 74_515);

    const result = await report.buildData({ ...dto, page: 1, limit: 50 }, actor);

    expect(result.total).toBe(74_515);
    expect(result.rows).toHaveLength(1);
  });

  it('pushes the breakdown filters down under their engine names (AC-16)', async () => {
    const { report, engine } = build([engineRow]);

    await report.buildData(
      {
        ...dto,
        columnFilters: [
          { col: 'inPurchase', gte: 1 },
          { col: 'outTotal', gte: 2 },
          { col: 'endingQty', gte: 3 },
        ],
      },
      actor,
    );

    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: {
          inQtyPurchase: { operator: '>=', value: 1 },
          outQty: { operator: '>=', value: 2 },
          closingQty: { operator: '>=', value: 3 },
        },
      }),
    );
  });

  // AC-17 — the six columns toRow assigns null because nothing backs them yet.
  // They pass through untranslated, so the engine has no spec and refuses. An
  // empty page that looks filtered would be the worse answer.
  it.each(['inWh', 'inOther', 'outPurchaseReturn', 'outWh', 'outVoid', 'outOther'])(
    'leaves %s untranslated, so the engine refuses to filter it',
    async (col) => {
      const { report, engine } = build([engineRow]);

      await report.buildData({ ...dto, columnFilters: [{ col, gte: 1 }] }, actor);

      const [[query]] = engine.aggregate.mock.calls;
      expect(Object.keys(query.columnFilters)).toEqual([col]);
    },
  );

  it('offers countRows so the export path keeps its cap (ADR-01)', async () => {
    const { report, engine } = build([engineRow], 74_515);

    await expect(report.countRows(dto, actor)).resolves.toEqual({
      total: 74_515,
      subject: 'rows',
    });
    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 1, includeBreakdown: true }),
    );
  });
});
