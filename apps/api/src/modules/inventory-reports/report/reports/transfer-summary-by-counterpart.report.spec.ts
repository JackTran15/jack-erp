import { TransferSummaryByCounterpartReport } from './transfer-summary-by-counterpart.report';
import { DocumentDetailReport } from './document-detail.report';

describe('TransferSummaryByCounterpartReport catalog', () => {
  const headers = async () => {
    const report = new TransferSummaryByCounterpartReport(
      null as never,
      null as never,
    );
    return report.buildColumns();
  };

  it('exposes the same 12 columns as the parent report', async () => {
    const cols = (await headers()).map((h) => h.col);

    expect(cols).toEqual([
      'branchCode', 'branchName',
      'inQty', 'inValue',
      'outQty', 'outValue',
      'receivedQty', 'receivedValue',
      'diffQty', 'diffValue',
      'inOutDiffQty', 'inOutDiffValue',
    ]);
  });

  /**
   * These four open the document dialogs. The value columns beside them do not:
   * the same document set backs both, so two links per band would be two ways
   * to reach one place.
   */
  it('links exactly the four quantity cells', async () => {
    const linked = (await headers()).filter((h) => h.link).map((h) => h.col);

    expect(linked).toEqual(['inQty', 'outQty', 'receivedQty', 'diffQty']);
  });

  /** The flag is opt-in, so an unrelated inventory report must be untouched. */
  it('does not leak the link flag into other inventory reports', async () => {
    const report = new DocumentDetailReport(null as never, null as never, null as never);
    const cols = await report.buildColumns();

    expect(cols.filter((h) => h.link)).toHaveLength(0);
  });
});

/**
 * L1 hands its column filters to the engine.
 *
 * Same hand-off as the two document dialogs: validated by `assertKnownColumns`,
 * then dropped. A test at the service layer cannot see this — the service is
 * correct either way (ADR-06, AC-16).
 */
describe('TransferSummaryByCounterpartReport column filters', () => {
  function build() {
    const engine = {
      summarizeByCounterpart: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, totals: {} }),
    };
    const branches = { find: jest.fn().mockResolvedValue([{ id: 'a' }]) };
    return {
      engine,
      report: new TransferSummaryByCounterpartReport(engine as never, branches as never),
    };
  }

  const dto = {
    reportType: 'inventory-transfer-summary-by-counterpart',
    columns: ['branchCode', 'branchName', 'outQty'],
    columnFilters: [{ col: 'branchName', contains: 'HCM' }],
    filters: {
      period: { from: '2026-01-01', to: '2026-12-31' },
      store: { scope: 'group', storeIds: ['a'] },
    },
  } as never;
  const actor = {
    organizationId: 'org-1',
    userId: 'u1',
    roles: [],
    branchIds: ['a'],
    branchId: 'a',
  } as never;

  it('passes them on buildData', async () => {
    const { report, engine } = build();

    await report.buildData(dto, actor);

    expect(engine.summarizeByCounterpart).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: { branchName: { operator: '*', value: 'HCM' } },
      }),
    );
  });

  it('passes them on countRows too', async () => {
    const { report, engine } = build();

    await report.countRows(dto, actor);

    expect(engine.summarizeByCounterpart).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: { branchName: { operator: '*', value: 'HCM' } },
      }),
    );
  });

  it('does not translate the column key through the totals key map', async () => {
    // `KEY_MAP` here maps a report column to the engine's TOTALS key
    // (inQty → qtyIn). Column specs are keyed by report column, so running the
    // filter through that map would 400 every box on the dialog.
    const { report, engine } = build();

    await report.buildData(
      { ...(dto as object), columnFilters: [{ col: 'inQty', gte: 1 }] } as never,
      actor,
    );

    const [[query]] = engine.summarizeByCounterpart.mock.calls;
    expect(query.columnFilters).toEqual({ inQty: { operator: '>=', value: 1 } });
    expect(query.columnFilters.qtyIn).toBeUndefined();
  });
});
