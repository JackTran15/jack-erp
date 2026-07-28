import { ReportDocumentPayload } from "@erp/shared-interfaces";
import { escapeHtml, renderTableRow } from "./print-format.util";

export type ReportPrintOrientation = "landscape" | "portrait";

/** Smaller font as more columns compete for the same A4 width. */
function fontSizeFor(columnCount: number): number {
  if (columnCount <= 6) return 12;
  if (columnCount <= 10) return 11;
  if (columnCount <= 16) return 10;
  return 9;
}

/**
 * Renders a `ReportDocumentPayload` into a self-contained A4 HTML document
 * for `printHtmlDocument` (T-02-01). The Excel counterpart is
 * `XlsxStreamWriter` — both read the same payload so a printed page and an
 * exported file can never drift apart (ADR-01).
 */
export function renderReportTableHtml(
  payload: ReportDocumentPayload,
  orientation: ReportPrintOrientation = "landscape",
): string {
  const { title, branch, subtitleLines, columns, rows, totals } = payload;
  const fontSize = fontSizeFor(columns.length);

  const branchLines = branch
    ? [branch.name, branch.address, branch.phone ? `SĐT: ${branch.phone}` : null].filter(
        (line): line is string => Boolean(line),
      )
    : [];

  const headerCells = columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const bodyRows = rows.map((row) => renderTableRow(columns, row)).join("");
  const totalsRow = totals ? renderTableRow(columns, totals, "totals") : "";

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 ${orientation}; margin: 10mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #000; font-family: Arial, Helvetica, sans-serif; }
      body { font-size: ${fontSize}px; }
      .branch-line { text-align: center; }
      .branch-line.name { font-weight: bold; font-size: ${fontSize + 2}px; }
      h1 { text-align: center; font-size: ${fontSize + 4}px; margin: 8px 0; }
      .subtitle-line { text-align: center; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8px; }
      thead { display: table-header-group; }
      th, td { border: 1px solid #333; padding: 4px 6px; word-wrap: break-word; }
      th { background: #f0f0f0; font-weight: bold; text-align: center; }
      .align-left { text-align: left; }
      .align-right { text-align: right; }
      .align-center { text-align: center; }
      tr.totals td { font-weight: bold; }
      tr { break-inside: avoid; }
    </style>
  </head>
  <body>
    ${branchLines.map((line, i) => `<div class="branch-line${i === 0 ? " name" : ""}">${escapeHtml(line)}</div>`).join("")}
    <h1>${escapeHtml(title)}</h1>
    ${subtitleLines.map((line) => `<div class="subtitle-line">${escapeHtml(line)}</div>`).join("")}
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}${totalsRow}</tbody>
    </table>
  </body>
</html>`;
}
