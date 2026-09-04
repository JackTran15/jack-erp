import { INVENTORY_REPORT_COLUMN_LABELS_VI } from '@erp/shared-interfaces';
import { TransferSummaryByCounterpartReport } from './transfer-summary-by-counterpart.report';
import { TransferDocumentDetailReport } from './transfer-document-detail.report';
import { TransferDifferenceDetailReport } from './transfer-difference-detail.report';
import { toTransferDetailRow, TRANSFER_DETAIL_COLUMNS } from './transfer-document-detail.report';

/**
 * The column catalog of these three reports is kept in five places by hand: the
 * `InventoryColumnDef[]`, the row projection, the engine's row type, the
 * Vietnamese label map, and the client fallback registry. TypeScript checks
 * exactly one of them.
 *
 * `INVENTORY_REPORT_COLUMN_LABELS_VI`'s inner type is `Record<string, string>`,
 * so a column added without a label does not fail to compile — it renders the
 * raw key as the column heading, in a dialog, in production. This spec is the
 * only mechanical guard available.
 */
describe('transfer report catalogs have a Vietnamese label for every column', () => {
  const reports = [
    ['inventory-transfer-summary-by-counterpart', new TransferSummaryByCounterpartReport(null as never, null as never)],
    ['inventory-transfer-document-detail', new TransferDocumentDetailReport(null as never, null as never)],
    ['inventory-transfer-difference-detail', new TransferDifferenceDetailReport(null as never, null as never)],
  ] as const;

  it.each(reports)('%s', async (key, report) => {
    const cols = await report.buildColumns();
    const labels = INVENTORY_REPORT_COLUMN_LABELS_VI[key] ?? {};

    const unlabelled = cols.filter((c) => !labels[c.col]).map((c) => c.col);
    expect(unlabelled).toEqual([]);

    // A heading equal to its own key is the symptom a missing label produces,
    // so assert the rendered name too rather than only the map lookup.
    const rawKeyHeadings = cols.filter((c) => c.name === c.col).map((c) => c.col);
    expect(rawKeyHeadings).toEqual([]);
  });

  /** L3 is L2 minus `warehouse`; drift between them is silent otherwise. */
  it('difference detail is document detail minus the warehouse column', async () => {
    const l2 = (await new TransferDocumentDetailReport(null as never, null as never).buildColumns()).map((c) => c.col);
    const l3 = (await new TransferDifferenceDetailReport(null as never, null as never).buildColumns()).map((c) => c.col);

    expect(l2).toContain('warehouse');
    expect(l3).toEqual(l2.filter((c) => c !== 'warehouse'));
  });

  /** The two new columns are the point of this change; pin their position. */
  it('puts Đối tượng and Diễn giải last', async () => {
    const l2 = (await new TransferDocumentDetailReport(null as never, null as never).buildColumns()).map((c) => c.col);

    expect(l2.slice(-2)).toEqual(['counterparty', 'notes']);
  });
});

/**
 * The mapper is the mirror that actually bit: `counterparty` and `notes` were
 * added to the catalog and to the engine, but `toTransferDetailRow` lists its
 * fields one by one, so `projectRows` dropped them and both columns rendered
 * empty. Nothing failed — not the compiler, not a query, not a test.
 */
describe('toTransferDetailRow emits every catalog column', () => {
  it('leaves no catalog key unmapped', () => {
    const row = toTransferDetailRow({
      date: '20/08/2026 13:10',
      documentNumber: 'XK1',
      reference: 'NK1',
      referenceDate: '25/08/2026 14:11',
      warehouse: 'KHO SG',
      counterparty: 'Phan Mạnh Tú',
      notes: 'ghi chú dòng',
      sku: 'A-1',
      name: 'Giày',
      unit: 'Đôi',
      qty: 1,
      unitPrice: 2,
      value: 2,
      parentSku: 'A',
      parentName: 'A',
      group: 'Giày nam',
    });

    const missing = TRANSFER_DETAIL_COLUMNS.map((c) => c.key).filter(
      (key) => row[key] === undefined,
    );
    expect(missing).toEqual([]);
  });
});

