import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockPeriodRow } from '../../services/stock-period.service';
import { StockSummaryByStoreReport } from './stock-summary-by-store.report';

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
  brand: null,
  color: null,
  size: null,
  branchId: 'b1',
  branchCode: null,
  branchName: 'CN Cần Thơ',
  openingQty: 10,
  openingValue: 1000,
  inQty: 5,
  inValue: 500,
  outQty: 3,
  outValue: 300,
  closingQty: 12,
  closingValue: 1200,
  transferOutQty: 0,
  transferOutValue: 0,
  incomingQty: 0,
  incomingValue: 0,
};

function build(rows: StockPeriodRow[]) {
  const engine = {
    aggregate: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return {
    report: new StockSummaryByStoreReport(engine as never, branches as never),
    engine,
  };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-stock-summary-by-store',
  columns: ['sku', 'branchCode', 'branch', 'openingQty', 'endingQty', 'endingValue'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('StockSummaryByStoreReport', () => {
  it('aggregates per branch and maps branch identity', async () => {
    const { report, engine } = build([engineRow]);
    const result = await report.buildData(dto, actor);
    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: 'item_branch' }),
    );
    expect(result.rows[0]).toEqual({
      sku: 'SKU-1',
      branchCode: null,
      branch: 'CN Cần Thơ',
      openingQty: 10,
      endingQty: 12,
      endingValue: 1200,
    });
  });

  it('exposes opening/in/out/ending bands in the catalog', async () => {
    const { report } = build([]);
    const cols = await report.buildColumns();
    expect(cols.find((c) => c.col === 'openingQty')!.group).toEqual({
      id: 'opening',
      name: 'Tồn đầu kỳ',
    });
    expect(cols.find((c) => c.col === 'endingValue')!.group).toEqual({
      id: 'ending',
      name: 'Tồn cuối kỳ',
    });
  });
});
