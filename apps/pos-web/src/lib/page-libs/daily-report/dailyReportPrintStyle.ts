/**
 * Shared A80 (80mm thermal) print stylesheet for the daily-report documents
 * ("BÁO CÁO TỔNG HỢP" + standalone "BÀN GIAO TIỀN" receipt). Header/footer are
 * plain text (no border); the data section renders as an actual bordered
 * table (grid lines between every row/column), matching the reference .xls
 * export look. Mirrors `checkout/printing/renderInvoiceHtml.ts` for paper
 * size + font so thermal output is consistent across the app.
 */
export const DAILY_REPORT_PRINT_STYLE = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.45;
  }
  /* Fixed 4mm side margin (80mm paper minus 72mm content, split evenly) —
     not auto, so the block stays pinned near the left edge instead of
     floating to the middle of a wider (non-thermal) page size. */
  .receipt { width: 72mm; margin: 0 4mm; padding: 2mm 0 4mm; }

  .header { text-align: left; margin-bottom: 4px; }
  .store-name { font-weight: 700; font-size: 13px; }
  .store-meta { font-size: 10.5px; }

  .doc-title { text-align: center; padding: 3px 0; margin-top: 4px; }
  .doc-title h1 {
    margin: 0; font-size: 14px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.03em;
  }

  .info-row { padding: 2px 0; word-break: break-word; }
  .info-row .label { font-weight: 700; }
  .info-row-center { text-align: center; }

  table.data-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin: 4px 0;
  }
  .data-table td {
    width: 50%;
    border: 1px solid #999;
    padding: 3px 5px;
    font-size: 10.5px;
    vertical-align: top;
    word-break: break-word;
  }
  .data-table td.value { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table tr.bold td { font-weight: 700; }
  .data-table td.level-1 { padding-left: 12px; }
  .data-table td.level-2 { padding-left: 24px; }

  .sign-row { display: flex; justify-content: space-between; margin-top: 14px; text-align: center; }
  .sign-col { width: 48%; }
  .sign-col .sign-title { font-weight: 700; }
  .sign-col .sign-name { margin-top: 24px; }

  @media print {
    body { margin: 0; }
  }
`;
