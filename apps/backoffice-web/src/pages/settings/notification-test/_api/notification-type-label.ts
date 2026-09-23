/**
 * Mã loại thông báo → tên tiếng Việt, cho người test đọc.
 *
 * Chữ lấy ĐÚNG theo màn "Thiết lập thông báo" của app erp_manager
 * (`assets/locales/vi.json` → `notifications.settingsPage.kind.*.title`): người
 * test bật/tắt ở app rồi bắn thử ở đây, hai bên gọi khác tên là họ phải tự dịch
 * trong đầu.
 *
 * Bảng này chỉ để HIỂN THỊ. Giá trị gửi lên vẫn là mã gốc (`invoice_return`) —
 * đó là hợp đồng với backend. Mã lạ (backend vừa thêm một loại mà web chưa
 * biết) thì hiện nguyên mã, không đoán và không giấu.
 */
const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  invoice: "Hoá đơn",
  invoice_return: "Đổi trả",
  invoice_edit: "Sửa hoá đơn",
  invoice_cancel: "Huỷ hoá đơn",
  purchase: "Nhập hàng",
  purchase_return: "Trả lại hàng mua",
  stock_in: "Nhập kho",
  stock_out: "Xuất kho",
  revenue: "Tình hình doanh thu",
  stock_alert: "Cảnh báo tồn kho",
  near_expiry: "Hàng hoá cận date",
};

/** Tên tiếng Việt, hoặc chính mã khi chưa có trong bảng. */
export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type] ?? type;
}

/** Nhãn đầy đủ cho ô chọn: "Hoá đơn (invoice)" — giữ mã để đối chiếu với log. */
export function notificationTypeOptionLabel(type: string): string {
  const label = NOTIFICATION_TYPE_LABELS[type];
  return label ? `${label} (${type})` : type;
}
