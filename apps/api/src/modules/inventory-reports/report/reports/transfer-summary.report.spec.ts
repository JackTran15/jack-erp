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
      // Hidden key, not a catalog column: the drill-down anchors on the branch
      // id because `branchCode` is nullable and `branchName` is not unique.
      _branchId: 'b1',
    });
  });

  /**
   * `paginateRows` projects to `dto.columns`, so the id has to be re-attached
   * after it. Column filters change both the length and the order of the row
   * list, which is why the re-attach indexes the FILTERED array rather than the
   * engine's output — get that wrong and rows carry another branch's id, which
   * a shape assertion on an unfiltered single row would never catch.
   */
  it('keeps _branchId aligned with the row after a column filter drops rows', async () => {
    const rows: TransferSummaryRow[] = [
      { ...engineRow, branchId: 'b1', branchName: 'CN 1', qtyOut: 0 },
      { ...engineRow, branchId: 'b2', branchName: 'CN 2', qtyOut: 8 },
    ];

    const result = await build(rows).buildData(
      { ...dto, columnFilters: [{ col: 'outQty', gt: 0 }] },
      actor,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.branchName).toBe('CN 2');
    expect(result.rows[0]!._branchId).toBe('b2');
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

/**
 * The catalog decides which cells LOOK clickable, and it has to, because
 * `ReportTableConfigSync` overwrites the client registry whenever the columns
 * API answers. Setting the flag only on the client makes a cell clickable or
 * not depending on whether a saved column template happens to exist.
 */
describe('TransferSummaryReport link affordances', () => {
  const headers = async () => {
    const report = new TransferSummaryReport(null as never, null as never);
    return report.buildColumns();
  };

  it('marks only the branch name as a link', async () => {
    const linked = (await headers()).filter((h) => h.link).map((h) => h.col);

    expect(linked).toEqual(['branchName']);
  });

  /**
   * A parent row aggregates every counterpart, so the difference dialog opened
   * from it could not name a receiving branch. It opens from L1 instead.
   */
  it('leaves the difference columns unlinked', async () => {
    const cols = await headers();

    expect(cols.find((h) => h.col === 'diffQty')?.link).toBeUndefined();
    expect(cols.find((h) => h.col === 'inOutDiffQty')?.link).toBeUndefined();
  });
});

