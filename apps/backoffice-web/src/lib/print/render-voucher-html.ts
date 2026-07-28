import { VoucherPrintPayload } from "@erp/shared-interfaces";
import { escapeHtml, renderTableRow } from "./print-format.util";

/**
 * Renders a `VoucherPrintPayload` into a self-contained HTML document for
 * `printHtmlDocument` (T-02-01). One skeleton for all 7 voucher kinds
 * (ADR-05): header → title → doc no/date → info block → line table → totals
 * → amount-in-words → signatures. What differs between kinds lives in the
 * payload (labels, columns), never as a branch here — a `kind` switch that
 * changes layout would mean the design failed.
 */
export function renderVoucherHtml(payload: VoucherPrintPayload): string {
  const {
    paper,
    title,
    docNo,
    docDate,
    branch,
    info,
    lineColumns,
    lines,
    totals,
    amountInWords,
    signatures,
  } = payload;

  const branchLines = branch
    ? [branch.name, branch.address, branch.phone ? `SĐT: ${branch.phone}` : null].filter(
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
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const bodyRows = lines.map((line) => renderTableRow(lineColumns, line)).join("");
  const totalsRow = totals ? renderTableRow(lineColumns, totals, "totals") : "";

  const amountInWordsBlock = amountInWords
    ? `<div class="amount-in-words"><span class="label">Số tiền bằng chữ:</span> ${escapeHtml(amountInWords)}</div>`
    : "";

  const signatureCells = signatures
    .map((label) => `<div class="signature-col"><div class="signature-label">${escapeHtml(label)}</div><div class="signature-hint">(Ký, họ tên)</div></div>`)
    .join("");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} ${escapeHtml(docNo)}</title>
    <style>
      @page { size: ${paper}; margin: 10mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
      .branch-line { text-align: center; }
      .branch-line.name { font-weight: bold; font-size: 14px; }
      h1 { text-align: center; font-size: 16px; margin: 8px 0 2px; text-transform: uppercase; }
      .doc-meta { text-align: center; font-size: 12px; margin-bottom: 8px; }
      .info-block { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-bottom: 8px; }
      .info-row { flex: 1 1 45%; }
      .info-row .label { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4px; }
      thead { display: table-header-group; }
      th, td { border: 1px solid #333; padding: 4px 6px; word-wrap: break-word; }
      th { background: #f0f0f0; font-weight: bold; text-align: center; }
      .align-left { text-align: left; }
      .align-right { text-align: right; }
      .align-center { text-align: center; }
      tr.totals td { font-weight: bold; }
      tr { break-inside: avoid; }
      .amount-in-words { margin-top: 8px; font-style: italic; }
      .amount-in-words .label { font-weight: bold; font-style: normal; }
      .signature-row { display: flex; justify-content: space-around; margin-top: 32px; break-inside: avoid; }
      .signature-col { text-align: center; }
      .signature-label { font-weight: bold; }
      .signature-hint { font-size: 10px; font-style: italic; }
    </style>
  </head>
  <body>
    ${branchLines.map((line, i) => `<div class="branch-line${i === 0 ? " name" : ""}">${escapeHtml(line)}</div>`).join("")}
    <h1>${escapeHtml(title)}</h1>
    <div class="doc-meta">Số: ${escapeHtml(docNo)} — Ngày: ${escapeHtml(docDate)}</div>
    <div class="info-block">${infoRows}</div>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}${totalsRow}</tbody>
    </table>
    ${amountInWordsBlock}
    <div class="signature-row">${signatureCells}</div>
  </body>
</html>`;
}
