import { DocumentColumn, ReportRow, VoucherPrintPayload } from '@erp/shared-interfaces';
import { ExportDocumentHeader } from './export.types';

export interface VoucherExportDocument {
  header: ExportDocumentHeader;
  columns: DocumentColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
}

/**
 * Adapts a `VoucherPrintPayload` into the shape `ExportPipeline` expects
 * (ADR-09) — reusing the report-export path instead of a payload/writer of
 * its own. `signatures` and `amountInWords` are deliberately dropped: they
 * are content for a page to be signed, not a spreadsheet.
 */
export function voucherToReportDocument(
  payload: VoucherPrintPayload,
): VoucherExportDocument {
  return {
    header: {
      title: `${payload.title} ${payload.docNo}`.trim(),
      branch: payload.branch,
      subtitleLines: payload.info.map((row) => `${row.label}: ${row.value}`),
    },
    columns: payload.lineColumns,
    rows: payload.lines,
    totals: payload.totals,
  };
}
