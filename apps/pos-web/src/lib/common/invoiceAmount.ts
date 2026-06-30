import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";

/**
 * "Tổng thanh toán" hiển thị có dấu: RETURN/EXCHANGE dùng netAmount (âm = hoàn tiền khách),
 * còn lại dùng amountDue. BE clamp amountDue về 0 cho đơn trả nên phải đọc netAmount.
 */
export function getInvoiceSignedTotal(
  invoice: Pick<InvoiceRow, "type" | "amountDue" | "netAmount">,
): number {
  const isRefundDirection =
    invoice.type === "RETURN" || invoice.type === "EXCHANGE";
  return isRefundDirection
    ? Number(invoice.netAmount) || 0
    : Number(invoice.amountDue) || 0;
}
