import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";

/**
 * "Tổng thanh toán" hiển thị có dấu: RETURN/EXCHANGE dùng netAmount (âm = hoàn tiền khách),
 * còn lại dùng amountDue.
 *
 * Vì sao đơn trả phải đọc netAmount: đường trả/đổi KHÔNG đi qua `computeAmountDue`,
 * nó ghi thẳng `amountDue = max(netAmount, 0)` (`checkout-return.service.ts`), nên
 * một phiếu hoàn tiền lưu `amount_due = 0` và cột sẽ ra 0 nếu đọc nhầm cột.
 * (Trước T-04-02 chỗ này ghi "BE clamp amountDue về 0 cho đơn trả" — nay chỉ **phần
 * tiền hàng** trong `computeAmountDue` bị clamp, không phải cả `amountDue`.)
 *
 * Bản sinh đôi SQL: `invoiceSignedTotalSql` (`apps/api/.../invoice-amount.util.ts`).
 * Kiểm chứng 2026-09-21 (T-04-03): hàm này đọc `amountDue` ĐÃ LƯU, không dựng lại
 * `subtotal − discount`, nên phí giao hàng mà T-04-02 cộng vào `amount_due` đi theo
 * mà không phải sửa một dòng nào ở đây. Hoá đơn 1.000.000 − 100.000 − 50.000 +
 * 30.000 (phí): DB = 880.000, cột = 880.000, `SUM()` của footer = 880.000.
 * Hoá đơn RETURN của chính nó: netAmount = −850.000 — không mang 30.000 phí (A-23).
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
