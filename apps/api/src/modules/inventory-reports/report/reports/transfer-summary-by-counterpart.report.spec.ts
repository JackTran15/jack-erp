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
    const report = new DocumentDetailReport(null as never, null as never);
    const cols = await report.buildColumns();

    expect(cols.filter((h) => h.link)).toHaveLength(0);
  });
});
