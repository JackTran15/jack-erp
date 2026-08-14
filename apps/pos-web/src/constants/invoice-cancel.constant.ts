import type { InvoiceStatus } from "@erp/pos/types/invoice.type";

/**
 * Quyền backend chặn ở `@RequirePermission('pos.invoice.cancel')`. Gate UI theo
 * đúng khóa này thay vì theo tên vai trò: tên vai trò là chuỗi tự do tổ chức
 * sửa được, còn khóa quyền thì không — đổi tên "Quản lý tổng" hay cấp quyền cho
 * một vai trò tự tạo đều không làm lệch nút bấm khỏi thứ server cho phép.
 */
export const INVOICE_CANCEL_PERMISSION = "pos.invoice.cancel";

/** Trạng thái hoá đơn còn huỷ được — khớp `CANCELLABLE_STATUSES` phía backend. */
export const CANCELLABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "paid",
  "debt",
  "partial_debt",
];

export interface CancelEligibilityInput {
  permissions: readonly string[];
  invoiceStatus: InvoiceStatus;
}

/**
 * Có được hiện nút "Hủy hóa đơn" không. Áp cho cả hóa đơn bán lẫn phiếu đổi trả
 * — backend tự chọn luồng huỷ theo `type` của chứng từ.
 *
 * Tách khỏi component để kiểm chứng được bằng test thuần — pos-web hiện chưa có
 * test runner (`"test": "echo test"`), nên chừng nào có thì đây là chỗ để test
 * trước tiên, thay vì phải dựng render cả dialog.
 */
export function canCancelInvoice({
  permissions,
  invoiceStatus,
}: CancelEligibilityInput): boolean {
  if (!permissions.includes(INVOICE_CANCEL_PERMISSION)) return false;
  return CANCELLABLE_INVOICE_STATUSES.includes(invoiceStatus);
}
