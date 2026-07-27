import type { InvoiceStatus, InvoiceType } from "@erp/pos/types/invoice.type";

/**
 * Vai trò được phép huỷ hoá đơn trên POS.
 *
 * Bảng `roles` không có cột mã ổn định — chỉ có `name` (tiếng Việt, unique theo
 * từng tổ chức), nên chỗ này buộc phải so theo tên hiển thị. Tổ chức nào đặt tên
 * vai trò khác thì bổ sung vào đây; backend vẫn chặn bằng quyền
 * `pos.invoice.write`, đây chỉ là lớp ẩn nút cho đúng người.
 */
export const INVOICE_CANCEL_ROLE_NAMES: readonly string[] = [
  "Quản trị hệ thống",
  "Quản lý tổng",
];

/** Trạng thái hoá đơn còn huỷ được — khớp `CANCELLABLE_STATUSES` phía backend. */
export const CANCELLABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "paid",
  "debt",
  "partial_debt",
];

export interface CancelEligibilityInput {
  roleNames: readonly string[];
  invoiceType: InvoiceType | undefined;
  invoiceStatus: InvoiceStatus;
}

/**
 * Có được hiện nút "Hủy hóa đơn" không.
 *
 * Tách khỏi component để kiểm chứng được bằng test thuần — pos-web hiện chưa có
 * test runner (`"test": "echo test"`), nên chừng nào có thì đây là chỗ để test
 * trước tiên, thay vì phải dựng render cả dialog.
 */
export function canCancelInvoice({
  roleNames,
  invoiceType,
  invoiceStatus,
}: CancelEligibilityInput): boolean {
  const isAdmin = roleNames.some((name) =>
    INVOICE_CANCEL_ROLE_NAMES.includes(name),
  );
  if (!isAdmin) return false;
  if ((invoiceType ?? "SALE") !== "SALE") return false;
  return CANCELLABLE_INVOICE_STATUSES.includes(invoiceStatus);
}
