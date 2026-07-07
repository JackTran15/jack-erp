import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockPeriodRow } from '../../services/stock-period.service';
import { StockQuantityDetailReport } from './stock-quantity-detail.report';

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

function build(rows: StockPeriodRow[]) {
  const engine = {
    aggregate: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const repo = { find: jest.fn().mockResolvedValue([]) };
  return {
    report: new StockQuantityDetailReport(engine as never, repo as never, repo as never),
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
});
