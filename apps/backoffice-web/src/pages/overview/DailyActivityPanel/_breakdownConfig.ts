/**
 * Cấu hình 9 modal chi tiết của row 1: tiêu đề và các dòng breakdown.
 *
 * Khoá tra cứu là `key` của card/dòng dựng trong `_api/overview.api.ts`, nên
 * nơi bấm và nơi mở modal dùng chung một định danh.
 */

export interface BreakdownLine {
  key: string;
  label: string;
  /** Dòng trạng thái tiêu cực — tô đỏ nhãn, badge và giá trị. */
  danger?: boolean;
}

export interface BreakdownConfig {
  title: string;
  lines: BreakdownLine[];
  /** Card 3 hiển thị thêm badge số lượng hóa đơn bên cạnh nhãn. */
  withCount?: boolean;
}

/** Ba phương thức thu tiền thật (`invoice_payments` / `debt_payments` / phiếu thu). */
const PAYMENT_LINES: BreakdownLine[] = [
  { key: "cash", label: "Tiền mặt" },
  { key: "transfer", label: "Chuyển khoản" },
  { key: "card", label: "Thẻ" },
];

const CASH_ONLY: BreakdownLine[] = [{ key: "cash", label: "Tiền mặt" }];

export const BREAKDOWN_CONFIG: Record<string, BreakdownConfig> = {
  // ── Card 1: Tiền thu trong ngày ────────────────────────────────────────
  cash_in: { title: "Tiền thu trong ngày", lines: PAYMENT_LINES },
  sales: { title: "Bán hàng", lines: PAYMENT_LINES },
  // Dấu "/" viết liền, không có dấu cách — spec nhấn mạnh.
  debt: { title: "Thu nợ/Thu COD", lines: PAYMENT_LINES },
  deposit: { title: "Khách đặt cọc", lines: CASH_ONLY },
  other: { title: "Thu khác", lines: PAYMENT_LINES },

  // ── Card 2: Doanh thu ước tính ─────────────────────────────────────────
  completed: {
    title: "Hóa đơn hoàn thành",
    lines: [
      { key: "collected", label: "Đã thu được tiền" },
      { key: "receivable", label: "Khách nợ" },
      { key: "on_behalf", label: "Thu hộ" },
    ],
  },
  processing: {
    title: "Hóa đơn đang xử lý",
    lines: [
      { key: "await_payment", label: "Chờ thanh toán" },
      { key: "await_delivery", label: "Chờ giao/lấy hàng" },
      { key: "delivering", label: "Đang giao hàng" },
      { key: "draft", label: "Lưu tạm" },
    ],
  },

  // ── Card 3: Hóa đơn (có badge số lượng) ────────────────────────────────
  in_store: {
    title: "Tại cửa hàng",
    withCount: true,
    lines: [
      { key: "await_payment", label: "Chờ thanh toán" },
      { key: "paid", label: "Đã thanh toán" },
      { key: "cancelled", label: "Đã hủy", danger: true },
    ],
  },
  delivery: {
    title: "Giao hàng",
    withCount: true,
    lines: [
      { key: "await_delivery", label: "Chờ giao/lấy hàng" },
      { key: "delivering", label: "Đang giao hàng" },
      { key: "done", label: "Hoàn thành" },
      { key: "await_cod", label: "Chờ thu COD" },
      { key: "failed", label: "Thất bại", danger: true },
      { key: "returned", label: "Đã chuyển hoàn", danger: true },
      { key: "cancelled", label: "Đã hủy", danger: true },
      { key: "draft", label: "Lưu tạm" },
    ],
  },
};
