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
 * (ADR-09) — reusing the report-export path instead of a payload of its own.
 *
 * It maps the table and nothing else. Everything around the table — document
 * number, date line, info block, totals label, amount in words, signatures —
 * goes straight from the payload into `VoucherXlsxWriter` (ADR-10), which knows
 * the voucher layout. Before that writer existed this function had to fold the
 * document number into the title and the info rows into `subtitleLines` so the
 * report writer would print them at all; that distortion is gone.
 */
export function voucherToReportDocument(
  payload: VoucherPrintPayload,
): VoucherExportDocument {
  return {
    header: {
      title: payload.title,
      branch: payload.branch,
      subtitleLines: [],
    },
    columns: payload.lineColumns,
    rows: payload.lines,
    totals: payload.totals,
  };
}
