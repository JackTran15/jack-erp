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

/** "Label: value" info row — trả "" khi thiếu giá trị để ẩn dòng. */
function infoRow(label: string, value?: string): string {
  if (!value) return "";
  return `
        <div class="info-row"><span class="label">${escapeHtml(label)}:</span> <span>${escapeHtml(value)}</span></div>`;
}

/** Dòng tiền label-trái / value-phải — trả "" khi amount undefined. */
function amountRow(
  label: string,
  amount: number | undefined,
  cls = "",
): string {
  if (amount == null) return "";
  return `
        <div class="row${cls ? ` ${cls}` : ""}">
          <span>${escapeHtml(label)}</span>
          <span class="value">${formatVnd(amount)}</span>
        </div>`;
}

/**
 * Render the invoice payload into a fully-self-contained HTML document.
 * Khổ A80 (giấy nhiệt 80mm, cuộn liên tục) — layout theo mẫu Misa eShop
 * (`local/images/invoice_a80_1.png` / `invoice_a80_2.png`): header giữa,
 * băng tiêu đề, info rows kẻ mảnh, bảng sản phẩm viền đen header sáng,
 * khối totals / settlement / dư nợ, quy định đổi trả, lời cảm ơn.
 *
 * Mọi dòng optional ẩn khi thiếu dữ liệu — các field "slot" trong
 * `InvoiceTotals` / `InvoiceInfoData` chưa có nguồn sẽ tự hiện khi được nối.
 *
 * Returned string is suitable for `iframe.contentDocument.write(...)` or for
 * dropping into a server-side PDF renderer (the spec is print-friendly).
 */
export function renderInvoiceHtml(invoice: InvoicePayload): string {
  const { store, invoiceNumber, issuedAt, info, lines, totals, payments } =
    invoice;

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
    .map((p) => amountRow(p.label, p.amount))
    .join("");

  // Khối KM: chỉ render khi có ít nhất 1 sub-row có dữ liệu. Tổng "Khuyến mãi"
  // = tổng các sub-row hiện có.
  const kmSubRows =
    (totals.itemDiscountTotal ?? 0) +
    (totals.invoiceDiscountTotal ?? 0) +
    (totals.voucherDiscount ?? 0);
  const promoBlock =
    totals.itemDiscountTotal != null ||
    totals.invoiceDiscountTotal != null ||
    totals.voucherDiscount != null
      ? `${amountRow("Khuyến mãi", kmSubRows, "bold-italic")}${amountRow(
          "KM theo mặt hàng",
          totals.itemDiscountTotal,
          "sub italic",
        )}${amountRow(
          "KM theo hóa đơn",
          totals.invoiceDiscountTotal,
          "sub italic",
        )}${amountRow(
          `Mã ưu đãi${invoice.voucherCode ? ` (${invoice.voucherCode})` : ""}`,
          totals.voucherDiscount,
          "sub italic",
        )}`
      : "";

  // Khối trả hàng (return / exchange) — ẩn hoàn toàn khi không có hàng trả.
  const returnBlock =
    totals.returnNet != null
      ? `${amountRow("Tiền hàng trả lại", totals.returnGross, "italic")}${amountRow(
          "KM",
          totals.returnDiscount,
          "sub italic",
        )}${amountRow("Giá trị trả lại", totals.returnNet, "bold-italic")}`
      : "";

  // Khối dư nợ — chỉ render khi có "Dư nợ trước" (slot, chưa có nguồn dữ liệu).
  const debtBlock =
    totals.debtBefore != null
      ? `${amountRow("Dư nợ trước", totals.debtBefore, "bold-italic")}${amountRow(
          "Nợ giảm",
          totals.debtReduction,
          "italic",
        )}${amountRow("Nợ tăng", totals.customerDebtIssued, "italic")}${amountRow(
          "Dư nợ sau",
          totals.debtAfter,
          "bold-italic",
        )}`
      : "";

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Hóa đơn ${escapeHtml(invoiceNumber)}</title>
    <style>
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
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .receipt { width: 72mm; margin: 0 auto; padding: 2mm 0 4mm; }

      .header { text-align: center; margin-bottom: 4px; }
      .logo {
        width: 40px; height: 40px;
        border: 2px solid #000;
        border-radius: 9999px;
        margin: 0 auto 2px auto;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 14px;
      }
      .logo-caption { font-weight: 700; font-size: 10px; letter-spacing: 0.05em; }
      .store-name { font-weight: 700; font-size: 13px; margin-top: 2px; }
      .store-meta { font-size: 10.5px; }

      .doc-title {
        text-align: center;
        background: #f0f0f0;
        border-top: 1px solid #ccc;
        border-bottom: 1px solid #ccc;
        padding: 3px 0;
        margin-top: 4px;
      }
      .doc-title h1 {
        margin: 0; font-size: 14px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.03em;
      }
      .doc-title .doc-number { font-size: 11.5px; font-weight: 700; margin-top: 1px; }

      .date-line {
        text-align: right;
        font-size: 10.5px;
        padding: 2px 0;
        margin: 0;
        border-bottom: 1px solid #ccc;
      }
      .date-line .label { font-weight: 700; }

      .info-row {
        padding: 2px 0;
        border-bottom: 1px solid #ccc;
        word-break: break-word;
      }
      .info-row .label { font-weight: 700; }
      /* Slot chèn thêm info row khi có nguồn dữ liệu:
         "Sinh hóa đơn giao hàng" / "Giao hàng từ hóa đơn". */

      table.product-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #000;
        margin: 4px 0;
      }
      .product-table th, .product-table td {
        border: 1px solid #000;
        padding: 2px 3px;
        font-size: 10.5px;
        vertical-align: top;
      }
      .product-table thead th {
        font-weight: 700;
        text-align: center;
      }
      .product-table .col-idx { text-align: center; width: 8%; }
      .product-table .col-name { text-align: left; word-break: break-word; }
      .product-table .col-name .line-sub { font-size: 9.5px; font-style: italic; }
      .product-table .col-qty { text-align: center; width: 11%; }
      .product-table .col-price { text-align: right; width: 21%; font-variant-numeric: tabular-nums; }
      .product-table .col-total { text-align: right; width: 23%; font-variant-numeric: tabular-nums; }

      .summary { font-size: 11px; }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 0;
        border-bottom: 1px solid #ccc;
      }
      .row .value { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .row.bold, .row.bold .value { font-weight: 700; }
      .row.italic { font-style: italic; }
      .row.bold-italic, .row.bold-italic .value { font-weight: 700; font-style: italic; }
      .row.sub { padding-left: 10px; }
      .row.grand-total {
        border-top: 2px solid #000;
        border-bottom: 1px solid #ccc;
        padding: 3px 0;
        font-weight: 700;
        font-size: 14px;
      }
      .row.grand-total .value { font-weight: 700; }

      .policy { padding: 6px 0 0; text-align: center; }
      .policy-title {
        font-weight: 700;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 2px;
      }
      .policy-body { font-size: 9.5px; line-height: 1.45; text-align: justify; }

      .closing {
        text-align: center;
        font-weight: 700;
        font-size: 11px;
        padding: 4px 0 0;
        margin: 0;
      }

      @media print {
        body { margin: 0; }
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <header class="header">
        <div class="logo" aria-hidden="true">MT'</div>
        <div class="logo-caption">GIÀY MT</div>
        <div class="store-name">${escapeHtml(store.name)}</div>
        <div class="store-meta">Đ/c: ${escapeHtml(store.address)}</div>
        <div class="store-meta">Số điện thoại: ${escapeHtml(store.phone)}</div>
      </header>

      <section class="doc-title">
        <h1>${invoice.provisional ? "HÓA ĐƠN TẠM TÍNH" : "HÓA ĐƠN"}</h1>
        <div class="doc-number">Số: ${escapeHtml(invoiceNumber)}</div>
      </section>

      <p class="date-line"><span class="label">Ngày:</span> ${escapeHtml(formatViDateTime(issuedAt, { separator: "space" }))}</p>

      <section class="info">${infoRow(
        "Trả hàng cho hóa đơn",
        info.returnForInvoiceRef,
      )}${infoRow("KH", info.customerName)}${infoRow(
        "SĐT",
        info.customerPhone,
      )}${infoRow("NV Thu ngân", info.cashierName)}${infoRow(
        "NVBH",
        info.salespersonName,
      )}${infoRow("Ngày giao hàng", info.deliveryDate)}${infoRow(
        "Đ/c",
        info.deliveryAddress,
      )}${infoRow("Ghi chú", info.note)}</section>

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

      <section class="summary">${amountRow(
        "Tổng SL mua",
        totals.totalQty,
        "bold",
      )}${returnBlock}${amountRow(
        "Tiền hàng",
        totals.subtotal,
        "bold-italic",
      )}${promoBlock}${amountRow(
        "Phí giao hàng",
        totals.deliveryFee,
        "sub italic",
      )}${amountRow("Phí đổi trả", totals.returnFee, "sub italic")}${amountRow(
        "Thuế GTGT",
        totals.vatAmount,
        "sub italic",
      )}${amountRow(
        "Tổng thanh toán:",
        totals.grandTotal,
        "grand-total",
      )}${amountRow("Đối trả", totals.exchangeOffset)}${amountRow(
        "Đặt cọc",
        totals.depositAmount,
      )}${amountRow(
        totals.pointsRedeemed != null
          ? `Điểm (${formatVnd(totals.pointsRedeemed)})`
          : "Điểm",
        totals.pointsDiscountAmount,
      )}${paymentRows}${amountRow("Giảm nợ", totals.debtReduction)}${amountRow(
        "Trả lại khách",
        totals.change,
        "bold",
      )}${amountRow(
        "Khách không lấy tiền thừa",
        totals.keptChange,
        "bold-italic",
      )}${amountRow(
        "Bớt tiền lẻ cho khách",
        totals.forgivenShortage,
        "bold-italic",
      )}${amountRow(
        "Khách nợ",
        totals.customerDebtIssued,
        "bold-italic",
      )}${amountRow("Thu hộ", totals.collectedOnBehalf, "bold-italic")}${amountRow(
        "Còn phải thu",
        totals.remainingReceivable,
        "bold-italic",
      )}${debtBlock}</section>

      <section class="policy">
        <div class="policy-title">${escapeHtml(invoice.policy.title)}</div>
        <div class="policy-body">${escapeHtml(invoice.policy.body)}</div>
      </section>

      <p class="closing">${escapeHtml(invoice.closingMessage)}</p>
    </div>
  </body>
</html>`;
}
