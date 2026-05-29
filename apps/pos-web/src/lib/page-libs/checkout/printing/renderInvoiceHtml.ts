import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";

/**
 * Format a number as VND, vi-VN grouping (1.650.000) — no currency symbol.
 * Mirrors the rest of the V2 panel and the spec section 4.5.10.
 */
function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount));
}

/** Escape a string for safe inclusion in HTML text content / attributes. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the invoice payload into a fully-self-contained HTML document.
 * Visual spec: `task/Invoice_description.md` — Times New Roman, b/w, A5 width,
 * black-bg table header, totals block, return policy, closing message.
 *
 * Returned string is suitable for `iframe.contentDocument.write(...)` or for
 * dropping into a server-side PDF renderer (the spec is print-friendly).
 */
export function renderInvoiceHtml(invoice: InvoicePayload): string {
  const { store, invoiceNumber, issuedAt, lines, totals, payments } = invoice;

  const rows = lines
    .map(
      (l) => `
        <tr>
          <td class="col-idx">${l.index}</td>
          <td class="col-name">${escapeHtml(l.name)}${
            l.discountLabel
              ? `<div class="line-sub">${escapeHtml(l.discountLabel)}</div>`
              : ""
          }${
            l.note ? `<div class="line-sub">Ghi chú: ${escapeHtml(l.note)}</div>` : ""
          }</td>
          <td class="col-qty">${formatVnd(l.qty)}</td>
          <td class="col-price">${formatVnd(l.unitPrice)}</td>
          <td class="col-total">${formatVnd(l.lineTotal ?? l.qty * l.unitPrice)}</td>
        </tr>`,
    )
    .join("");

  // One summary row per payment method (Tiền mặt, Master debit, …). Multi-row
  // when the cashier split the payment across methods; collapses to a single
  // row when only one method was used.
  const paymentRows = payments
    .map(
      (p) => `
        <div class="summary-row">
          <span>${escapeHtml(p.label)}</span>
          <span class="value">${formatVnd(p.amount)}</span>
        </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Hóa đơn ${escapeHtml(invoiceNumber)}</title>
    <style>
      @page { size: A5; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #000000;
        font-family: "Times New Roman", Times, serif;
        font-size: 13px;
        line-height: 1.5;
      }
      .receipt { padding: 16px 24px; max-width: 595px; margin: 0 auto; }

      .header { text-align: center; margin-bottom: 8px; }
      .logo {
        width: 64px; height: 64px;
        border: 2px solid #000;
        border-radius: 9999px;
        margin: 0 auto 4px auto;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 18px;
        font-family: "Times New Roman", Times, serif;
      }
      .logo-caption { font-weight: 700; font-size: 12px; letter-spacing: 0.05em; }
      .store-name { font-weight: 700; font-size: 14px; margin-top: 4px; }
      .store-meta { font-size: 12px; }

      .doc-title { text-align: center; padding: 8px 0; }
      .doc-title h1 {
        margin: 0; font-size: 16px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.05em;
      }
      .doc-title .doc-number { font-size: 13px; font-weight: 400; margin-top: 4px; }

      .date-line { font-size: 12px; padding: 4px 0; margin: 0 0 8px 0; }

      table.product-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #000;
        margin: 0 0 8px 0;
      }
      .product-table th, .product-table td {
        border: 1px solid #000;
        padding: 4px 8px;
        font-size: 13px;
      }
      .product-table thead th {
        background: #000;
        color: #fff;
        font-weight: 700;
        text-align: center;
      }
      .product-table .col-idx { text-align: center; width: 32px; color: #000; }
      .product-table .col-name { text-align: left; color: #000; }
      .product-table .col-name .line-sub { font-size: 11px; font-style: italic; }
      .product-table .col-qty { text-align: center; width: 48px; color: #000; }
      .product-table .col-price { text-align: right; width: 96px; font-variant-numeric: tabular-nums; color: #000; }
      .product-table .col-total { text-align: right; width: 96px; font-variant-numeric: tabular-nums; color: #000; }

      .summary {
        border-top: 1px solid #000;
        padding: 4px 0;
        font-size: 13px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 2px 0;
      }
      .summary-row .value { font-variant-numeric: tabular-nums; }
      .summary-row.bold { font-weight: 700; }
      .summary-row.bold .value { font-weight: 700; }
      .summary-row.grand-total {
        border-top: 1px solid #000;
        padding-top: 4px;
        margin-top: 2px;
        font-weight: 700;
        font-size: 14px;
      }
      .summary-row.change .value { font-style: italic; }
      .summary-row.forgiven { font-weight: 700; font-style: italic; }
      .summary-row.forgiven .value { font-weight: 700; }

      .km-line {
        border-top: 1px solid #000;
        padding: 4px 0;
        margin: 0 0 16px 0;
        font-size: 13px;
        font-weight: 700;
      }
      .km-line .value { font-weight: 400; margin-left: 8px; }

      .policy { padding: 8px 0; text-align: center; }
      .policy-title {
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .policy-body { font-size: 11px; line-height: 1.5; text-align: justify; }

      .closing {
        text-align: center;
        font-weight: 700;
        font-size: 12px;
        padding: 4px 0;
        margin-top: 8px;
      }

      @media print {
        body { margin: 0; }
        .receipt { padding: 0; }
        table.product-table { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <header class="header">
        <div class="logo" aria-hidden="true">MT'</div>
        <div class="logo-caption">GIÀY MT</div>
        <div class="store-name">${escapeHtml(store.name)}</div>
        <div class="store-meta">Địa: ${escapeHtml(store.address)}</div>
        <div class="store-meta">Sdt: ${escapeHtml(store.phone)}</div>
      </header>

      <section class="doc-title">
        <h1>${invoice.provisional ? "HÓA ĐƠN TẠM TÍNH" : "HÓA ĐƠN"}</h1>
        <div class="doc-number">Số: ${escapeHtml(invoiceNumber)}</div>
      </section>

      <p class="date-line">Ngày: ${escapeHtml(formatViDateTime(issuedAt, { separator: "space" }))}</p>

      <table class="product-table">
        <thead>
          <tr>
            <th class="col-idx">#</th>
            <th class="col-name">Tên hàng hóa</th>
            <th class="col-qty">SL</th>
            <th class="col-price">ĐG</th>
            <th class="col-total">TT</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="summary">
        <div class="summary-row bold">
          <span>Tổng SL mua</span>
          <span class="value">${formatVnd(totals.totalQty)}</span>
        </div>
        <div class="summary-row">
          <span>Tiền hàng</span>
          <span class="value">${formatVnd(totals.subtotal)}</span>
        </div>
        <div class="summary-row grand-total">
          <span>Tổng thanh toán:</span>
          <span class="value">${formatVnd(totals.grandTotal)}</span>
        </div>
        ${paymentRows}
        <div class="summary-row change">
          <span>Trả lại khách</span>
          <span class="value">${formatVnd(totals.change)}</span>
        </div>
        ${
          totals.keptChange != null && totals.keptChange > 0
            ? `<div class="summary-row forgiven">
          <span>Khách không lấy tiền thừa</span>
          <span class="value">${formatVnd(totals.keptChange)}</span>
        </div>`
            : ""
        }
        ${
          totals.forgivenShortage != null && totals.forgivenShortage > 0
            ? `<div class="summary-row forgiven">
          <span>Bớt tiền lẻ cho khách</span>
          <span class="value">${formatVnd(totals.forgivenShortage)}</span>
        </div>`
            : ""
        }
        ${
          totals.debtReduction != null && totals.debtReduction > 0
            ? `<div class="summary-row forgiven">
          <span>Giảm nợ</span>
          <span class="value">${formatVnd(totals.debtReduction)}</span>
        </div>`
            : ""
        }
        ${
          totals.customerDebtIssued != null && totals.customerDebtIssued > 0
            ? `<div class="summary-row forgiven">
          <span>Khách nợ</span>
          <span class="value">${formatVnd(totals.customerDebtIssued)}</span>
        </div>`
            : ""
        }
      </section>

      <p class="km-line">
        HĐ đã được KM:${
          invoice.discountNote
            ? `<span class="value">${escapeHtml(invoice.discountNote)}</span>`
            : ""
        }
      </p>

      <section class="policy">
        <div class="policy-title">${escapeHtml(invoice.policy.title)}</div>
        <div class="policy-body">${escapeHtml(invoice.policy.body)}</div>
      </section>

      <p class="closing">${escapeHtml(invoice.closingMessage)}</p>
    </div>
  </body>
</html>`;
}
