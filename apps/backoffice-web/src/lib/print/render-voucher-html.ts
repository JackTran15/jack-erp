import { DocumentColumn, ReportRow, VoucherPrintPayload } from "@erp/shared-interfaces";
import { alignOf, escapeHtml, formatCell, isNumberColumn } from "./print-format.util";

/**
 * Renders a `VoucherPrintPayload` into a self-contained HTML document for
 * `printHtmlDocument` (T-02-01). One skeleton for all 7 voucher kinds
 * (ADR-05): header → title → date → number → info block → line table → totals
 * → amount-in-words → signing date → signatures. What differs between kinds
 * lives in the payload (labels, columns), never as a branch here — a `kind`
 * switch that changes layout would mean the design failed.
 *
 * The layout mirrors the reference printouts in `examples/ERP/in_phieu_*.pdf`,
 * which are the same document as the exported workbook minus the columns the
 * spreadsheet hides. That is ADR-01 working: one payload, two renderers, no
 * drift — so a change here usually needs the matching change in
 * `VoucherXlsxWriter`.
 */

const SIGNATURE_DATE_LINE = "Ngày.......tháng.......năm............";
const SIGNATURE_HINT = "(Ký, họ tên)";
const DEFAULT_TOTALS_LABEL = "Tổng";

/**
 * The paper geometry, pinned in CSS instead of left to `@page` alone.
 *
 * Chrome's own "Margins" dropdown overrides the `@page` margin — pick "None"
 * and the page box grows from 190 mm to the full 210 mm, so the voucher spreads
 * to both paper edges and the printer's unprintable border eats the first
 * characters of every left-aligned line. Chrome remembers that choice per
 * destination, and this machine also prints 80 mm POS receipts with `margin: 0`
 * (`pos-web`'s `renderInvoiceHtml`), so the setting really does travel.
 *
 * `.sheet` therefore carries the printable width itself and centres inside
 * whatever page box it is given: identical to today when the margin survives,
 * still correct when it does not.
 */
const PAGE_MARGIN_MM = 10;
const PAPER_WIDTH_MM: Record<VoucherPrintPayload["paper"], number> = {
  A4: 210,
  A5: 148,
};

/** Grid columns a column occupies — the same `span` the workbook merges across. */
function spanOf(column: DocumentColumn): number {
  return Math.max(1, column.span ?? 1);
}

/**
 * Matches `WIDTH_DEFAULT` in `VoucherXlsxWriter`, so a voucher that declares no
 * widths prints with the proportions it had before widths existed.
 */
const DEFAULT_COLUMN_WIDTH = 17;

function widthOf(column: DocumentColumn): number {
  return column.width ?? DEFAULT_COLUMN_WIDTH;
}

/**
 * The `<colgroup>` that gives `table-layout: fixed` something to lay out.
 *
 * Without it the browser splits the width evenly across every grid column, so
 * "STT" gets as much room as "Thành tiền" and a 16-character SKU wraps. The
 * widths are the character counts the spreadsheet uses (ADR-13), normalised to
 * percentages here.
 *
 * One `<col>` per *grid* column, not per logical column: a column with `span`
 * covers several, and emitting one `<col>` for it would slide every column
 * after it out of line with its `colspan`.
 */
function renderColgroup(columns: DocumentColumn[]): string {
  const totalUnits = columns.reduce(
    (total, column) => total + widthOf(column) * spanOf(column),
    0,
  );
  if (totalUnits <= 0) return "";

  const cols = columns
    .flatMap((column) => {
      const percent = ((widthOf(column) / totalUnits) * 100).toFixed(2);
      return Array<string>(spanOf(column)).fill(
        `<col style="width: ${percent}%" />`,
      );
    })
    .join("");

  return `<colgroup>${cols}</colgroup>`;
}

/**
 * How many leading grid columns the totals label spans: everything up to the
 * first figure, so no total is ever hidden underneath it.
 */
function labelSpan(columns: DocumentColumn[]): number {
  const firstNumber = columns.findIndex(isNumberColumn);
  if (firstNumber <= 0) return 1;
  return columns
    .slice(0, firstNumber)
    .reduce((total, column) => total + spanOf(column), 0);
}

function renderCell(column: DocumentColumn, value: ReportRow[string]): string {
  const span = spanOf(column);
  const colspan = span > 1 ? ` colspan="${span}"` : "";
  return `<td${colspan} class="align-${alignOf(column)}">${formatCell(column, value)}</td>`;
}

/** The totals row, with its label in the leading cells and the figures after. */
function renderTotalsRow(
  columns: DocumentColumn[],
  totals: ReportRow | null,
  totalsLabel: string | undefined,
): string {
  if (!totals) return "";

  const firstNumber = columns.findIndex(isNumberColumn);
  const covered = firstNumber <= 0 ? 1 : firstNumber;
  const label = escapeHtml(totalsLabel ?? DEFAULT_TOTALS_LABEL);
  const figures = columns
    .slice(covered)
    .map((column) => renderCell(column, totals[column.col]))
    .join("");

  return `<tr class="totals"><td colspan="${labelSpan(columns)}" class="align-left">${label}</td>${figures}</tr>`;
}

export function renderVoucherHtml(payload: VoucherPrintPayload): string {
  const {
    paper,
    title,
    docNo,
    docDate,
    branch,
    info,
    lines,
    totals,
    totalsLabel,
    amountInWords,
    signatures,
  } = payload;

  // Filtered once, then used for the header, every body row and the totals row:
  // three separate filters would be three chances for the columns to disagree.
  // Hidden columns exist for the spreadsheet; the printed voucher omits them,
  // which is exactly what the reference printouts do.
  const lineColumns = payload.lineColumns.filter((column) => !column.hidden);

  const sheetWidthMm = PAPER_WIDTH_MM[paper] - PAGE_MARGIN_MM * 2;

  const branchLines = branch
    ? [branch.name, branch.address, branch.phone].filter(
        (line): line is string => Boolean(line),
      )
    : [];

  const infoRows = info
    .map(
      (row) =>
        `<div class="info-row"><span class="label">${escapeHtml(row.label)}:</span> <span>${escapeHtml(row.value)}</span></div>`,
    )
    .join("");

  const headerCells = lineColumns
    .map((column) => {
      const span = spanOf(column);
      const colspan = span > 1 ? ` colspan="${span}"` : "";
      return `<th${colspan}>${escapeHtml(column.label)}</th>`;
    })
    .join("");
  const bodyRows = lines
    .map(
      (line) =>
        `<tr>${lineColumns.map((column) => renderCell(column, line[column.col])).join("")}</tr>`,
    )
    .join("");

  const amountInWordsBlock = amountInWords
    ? `<div class="amount-in-words"><span class="label">Số tiền viết bằng chữ:</span> ${escapeHtml(amountInWords)}</div>`
    : "";

  const signatureCells = signatures
    .map(
      (label) =>
        `<div class="signature-col"><div class="signature-label">${escapeHtml(label)}</div><div class="signature-hint">${SIGNATURE_HINT}</div></div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} ${escapeHtml(docNo)}</title>
    <style>
      @page { size: ${paper}; margin: ${PAGE_MARGIN_MM}mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #000; font-family: "Times New Roman", Times, serif; font-size: 13px; }
      .sheet { width: ${sheetWidthMm}mm; max-width: 100%; margin: 0 auto; }
      .branch-line { text-align: left; }
      .branch-line.name { font-weight: bold; }
      h1 { text-align: center; font-size: 20px; margin: 14px 0 4px; text-transform: uppercase; }
      .doc-date { text-align: center; font-weight: bold; font-style: italic; }
      .doc-no { text-align: center; font-weight: bold; margin-bottom: 8px; }
      .info-block { margin-bottom: 8px; }
      .info-row { text-align: left; }
      .info-row .label { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4px; }
      thead { display: table-header-group; }
      th, td { border: 1px solid #333; padding: 4px 6px; word-wrap: break-word; }
      th { font-weight: bold; text-align: center; vertical-align: middle; }
      .align-left { text-align: left; }
      .align-right { text-align: right; }
      .align-center { text-align: center; }
      tr.totals td { font-weight: bold; }
      tr { break-inside: avoid; }
      .amount-in-words { margin-top: 8px; }
      .amount-in-words .label { font-weight: bold; }
      .signing-date { text-align: right; font-style: italic; margin-top: 24px; }
      .signature-row { display: flex; justify-content: space-around; margin-top: 4px; break-inside: avoid; }
      .signature-col { text-align: center; }
      .signature-label { font-weight: bold; }
      .signature-hint { font-style: italic; }
    </style>
  </head>
  <body>
    <div class="sheet">
      ${branchLines.map((line, i) => `<div class="branch-line${i === 0 ? " name" : ""}">${escapeHtml(line)}</div>`).join("")}
      <h1>${escapeHtml(title)}</h1>
      <div class="doc-date">Ngày ${escapeHtml(docDate)}</div>
      <div class="doc-no">Số: ${escapeHtml(docNo)}</div>
      <div class="info-block">${infoRows}</div>
      <table>
        ${renderColgroup(lineColumns)}
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}${renderTotalsRow(lineColumns, totals, totalsLabel)}</tbody>
      </table>
      ${amountInWordsBlock}
      <div class="signing-date">${SIGNATURE_DATE_LINE}</div>
      <div class="signature-row">${signatureCells}</div>
    </div>
  </body>
</html>`;
}
