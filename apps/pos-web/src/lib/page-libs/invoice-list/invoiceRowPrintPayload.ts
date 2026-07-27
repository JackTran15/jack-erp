import { INVOICE_PAYMENT_METHOD_LABEL } from "@erp/pos/constants/checkout.constant";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { InvoiceStoreInfo } from "@erp/pos/interfaces/invoice-printing.interface";

/**
 * Dựng payload in từ một hoá đơn **đã lưu** (`GET /invoices/:id`).
 *
 * Khác `buildCheckoutInvoicePayload`: hàm kia dựng từ state giỏ hàng đang
 * thanh toán và tự sinh số hoá đơn; ở đây mọi con số đã chốt trên server, nên
 * chỉ ánh xạ lại — không tính lại tiền, không sinh số mới.
 *
 * Cột `numeric` của Postgres về FE ở dạng string, nên mọi số đều phải qua
 * `Number()` trước khi cộng.
 */
export function buildInvoiceRowPrintPayload(
  invoice: InvoiceRow,
  options: {
    store?: InvoiceStoreInfo;
    cashierName?: string;
    copies?: number;
  } = {},
): InvoicePayload {
  const items = invoice.items ?? [];
  const isReturnExchange = invoice.type === "RETURN" || invoice.type === "EXCHANGE";

  const totalQty = items.reduce(
    (sum, item) => sum + Math.abs(Number(item.quantity) || 0),
    0,
  );
  const subtotal = items.reduce(
    (sum, item) =>
      sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
    0,
  );
  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + (Number(item.lineDiscount) || 0),
    0,
  );

  const paymentRows = invoice.payments ?? [];
  const payments =
    paymentRows.length > 0
      ? paymentRows.map((p) => ({
          label: INVOICE_PAYMENT_METHOD_LABEL[p.paymentMethod],
          amount: Number(p.amount) || 0,
        }))
      : invoice.paymentMethod
        ? [
            {
              label: INVOICE_PAYMENT_METHOD_LABEL[invoice.paymentMethod],
              amount: Number(invoice.totalPaid) || 0,
            },
          ]
        : [];

  const depositAmount = Number(invoice.depositAmount) || 0;
  const pointsRedeemed = Number(invoice.pointsRedeemed) || 0;
  const pointsEarned = Number(invoice.pointsEarned) || 0;
  const pointsReversed = Number(invoice.pointsReversed) || 0;
  const remainingDebt = Number(invoice.remainingDebt) || 0;

  return {
    store: options.store ?? {
      name: invoice.branch?.name ?? "",
      address: "",
      phone: "",
    },
    // Số hoá đơn thật do document-numbering cấp — không sinh lại.
    invoiceNumber: invoice.code,
    issuedAt: new Date(invoice.issuedAt ?? invoice.createdAt),
    info: {
      customerName: invoice.customer?.name?.trim() || undefined,
      customerPhone: invoice.customer?.phone?.trim() || undefined,
      cashierName: options.cashierName?.trim() || undefined,
      note: invoice.note?.trim() || undefined,
    },
    lines: items.map((item, index) => ({
      index: index + 1,
      name: item.itemName,
      qty: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      lineTotal: Number(item.lineTotal) || 0,
      note: item.note?.trim() || undefined,
    })),
    totals: {
      totalQty,
      subtotal,
      itemDiscountTotal: itemDiscountTotal > 0 ? itemDiscountTotal : undefined,
      grandTotal: Number(invoice.amountDue) || 0,
      depositAmount: depositAmount > 0 ? depositAmount : undefined,
      paid: Number(invoice.totalPaid) || 0,
      change: 0,
      // Phần chưa thu của hoá đơn công nợ — in để khách biết còn nợ bao nhiêu.
      customerDebtIssued: remainingDebt > 0 ? remainingDebt : undefined,
      pointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
      pointsDiscountAmount:
        pointsRedeemed > 0
          ? Number(invoice.pointsDiscountAmount) || 0
          : undefined,
      pointsEarned: pointsEarned > 0 ? pointsEarned : undefined,
      pointsReversed: pointsReversed > 0 ? pointsReversed : undefined,
    },
    payments,
    isReturnExchange,
    copies: options.copies && options.copies > 1 ? options.copies : undefined,
    policy: { title: "", body: "" },
    closingMessage: "Giày MT hân hạnh phục vụ quý khách!",
  };
}
