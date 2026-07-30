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
  /**
   * Formula notation shown under the label, e.g. "(2)=(3)/(1)".
   *
   * Carried from `ReportColumnHeader.desc` so a printed page and an exported
   * file annotate a column the same way the on-screen grid does. Independent of
   * `label`: a user-renamed column keeps its notation. Vouchers have none.
   */
  desc?: string | null;
  type: ReportColumnDataType;
  /** Suggested width. Excel reads it as characters, HTML as a flex hint. */
  width?: number;
  /** Omitted means the renderer derives it from `type` (numbers right, rest left). */
  align?: 'left' | 'right' | 'center';
  /**
   * Carried into the spreadsheet but hidden from view, and left out of the
   * printed page entirely.
   *
   * The reference vouchers do this for columns the document defines but does
   * not normally show — the value is there for whoever unhides the column,
   * while the paper stays uncluttered.
   */
  hidden?: boolean;
  /**
   * How many spreadsheet columns this one occupies; default 1.
   *
   * A logical column is not always one grid column: the reference vouchers give
   * "Tên hàng hóa" four, merged on every row, because a product name needs the
   * room. Renderers merge (Excel) or `colspan` (HTML) across the span.
   */
  span?: number;
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
