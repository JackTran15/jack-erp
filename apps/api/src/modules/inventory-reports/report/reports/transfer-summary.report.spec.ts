import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { TransferSummaryRow } from '../../services/transfer-report.service';
import { TransferSummaryReport } from './transfer-summary.report';

const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

const engineRow: TransferSummaryRow = {
  branchId: 'b1',
  branchCode: null,
  branchName: 'CN 1',
  qtyIn: 10,
  valueIn: 1000,
  qtyOut: 8,
  valueOut: 800,
  qtyReceived: 7,
  valueReceived: 700,
  qtyDifference: -1,
  valueDifference: -100,
  qtyInOutDifference: 2,
  valueInOutDifference: 200,
};

function build(rows: TransferSummaryRow[]) {
  const engine = {
    summarize: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return new TransferSummaryReport(engine as never, branches as never);
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-transfer-summary',
  columns: [
    'branchCode', 'branchName', 'inQty', 'outQty', 'receivedQty',
    'diffQty', 'diffValue', 'inOutDiffQty', 'inOutDiffValue',
  ],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('TransferSummaryReport', () => {
  it('maps inOutDiff from qtyInOutDifference — NOT qtyDifference (legacy FE bug)', async () => {
    const result = await build([engineRow]).buildData(dto, actor);
    expect(result.rows[0]).toEqual({
      branchCode: null,
      branchName: 'CN 1',
      inQty: 10,
      outQty: 8,
      receivedQty: 7,
      diffQty: -1,
      diffValue: -100,
      inOutDiffQty: 2,
      inOutDiffValue: 200,
    });
  });

  it('exposes the five transfer bands', async () => {
    const cols = await build([]).buildColumns();
    expect(cols.find((c) => c.col === 'inQty')!.group!.name).toBe('Nhập kho điều chuyển');
    expect(cols.find((c) => c.col === 'receivedQty')!.group!.name).toBe(
      'Cửa hàng khác thực nhận về',
    );
    expect(cols.find((c) => c.col === 'inOutDiffQty')!.group!.name).toBe(
      'Chênh lệch nhập xuất điều chuyển',
    );
  });
});
