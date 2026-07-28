import { ReportColumnDataType } from '../invoice-report/column';
import { ReportRow } from '../invoice-report/search';

/**
 * The seam between fetching report data and rendering it (ADR-01).
 *
 * Every data path stops at `ReportDocumentPayload`; every renderer starts from
 * it. The server turns it into an .xlsx workbook; the browser turns the same
 * shape into printable HTML. Because both renderers read one payload, an
 * exported file and a printed page can never drift apart.
 *
 * Nothing here describes presentation — no fonts, no colours, no paper size.
 * A renderer owns those.
 */

/** Issuing branch printed in the document header; null for chain-wide reports. */
export interface DocumentBranchInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
}

/**
 * One column of a rendered document. `label` is already resolved — the user's
 * renamed label when there is one, otherwise the catalog name — so a renderer
 * never has to look anything up.
 */
export interface DocumentColumn {
  /** Catalog column key; matches the keys of every `ReportRow` in the payload. */
  col: string;
  label: string;
  type: ReportColumnDataType;
  /** Suggested width. Excel reads it as characters, HTML as a flex hint. */
  width?: number;
  /** Omitted means the renderer derives it from `type` (numbers right, rest left). */
  align?: 'left' | 'right' | 'center';
}

/** A tabular document — one report or ledger — ready to render in any format. */
export interface ReportDocumentPayload {
  /** Document title, e.g. "TỔNG HỢP NHẬP XUẤT TỒN KHO". */
  title: string;
  branch: DocumentBranchInfo | null;
  /** Context lines under the title: period, active filters, generation time. */
  subtitleLines: string[];
  /** Visible columns, in display order. */
  columns: DocumentColumn[];
  rows: ReportRow[];
  /** Totals over every filtered row, not just this page; null when there are no rows. */
  totals: ReportRow | null;
}
