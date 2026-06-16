export interface ReportFilterOption {
  value: string;
  label: string;
}

// Trạng thái hóa đơn (multi-select chip) — theo report_filter_confirm_2.md.
export const invoiceStatusOptions: ReportFilterOption[] = [
  { value: "draft", label: "Lưu tạm" },
  { value: "awaiting_delivery", label: "Chờ giao/lấy hàng" },
  { value: "delivering", label: "Đang giao hàng" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
  { value: "failed", label: "Thất bại" },
  { value: "returned", label: "Đã chuyển hoàn" },
  { value: "awaiting_cod", label: "Chờ thu COD" },
];

// Loại ngày dùng để thống kê (single select).
export const statDateTypeOptions: ReportFilterOption[] = [
  { value: "invoice_date", label: "Ngày hóa đơn" },
  { value: "created_date", label: "Ngày tạo" },
];

// NV thu ngân / NV bán hàng / Khách hàng — mock (chain mode chưa có backend, xem CLAUDE.local.md).
export const cashierOptions: ReportFilterOption[] = [
  { value: "all", label: "Tất cả" },
  { value: "cashier_01", label: "Nguyễn Thị Thu" },
  { value: "cashier_02", label: "Trần Văn Cường" },
];

export const salespersonOptions: ReportFilterOption[] = [
  { value: "all", label: "Tất cả" },
  { value: "sales_01", label: "Lê Minh Hoàng" },
  { value: "sales_02", label: "Phạm Thu Hà" },
];

export const customerOptions: ReportFilterOption[] = [
  { value: "all", label: "Tất cả" },
  { value: "customer_01", label: "Khách lẻ" },
  { value: "customer_02", label: "Công ty TNHH ABC" },
];
