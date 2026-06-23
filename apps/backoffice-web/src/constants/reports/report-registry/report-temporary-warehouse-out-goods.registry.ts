import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import type { ReportColumnConfig, ReportTableConfig } from "../report.interface";

let order = 0;
const txt = (
  column: string,
  label: string,
  width: number,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "text" },
});
const num = (
  column: string,
  label: string,
  width: number,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "number", align: "right" },
});
// Cột ngày: filter = chip so sánh + date picker (suy ra từ dataType "date").
const dateCol = (
  column: string,
  label: string,
  width: number,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "date" },
});
// Cột giờ: filter = chip so sánh + time picker.
const timeCol = (
  column: string,
  label: string,
  width: number,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "text", filterKind: "time" },
});
// Cột select: filter = dropdown options, không có toán tử, mặc định "Tất cả".
const selectCol = (
  column: string,
  label: string,
  width: number,
  filterOptions: { value: string; label: string }[],
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "text", filterKind: "select", filterOptions },
});

// Options trạng thái — mock, BE chưa hỗ trợ chuỗi; chỉnh lại theo giá trị thật sau.
const STATUS_FILTER_OPTIONS = [
  { value: "exported", label: "Đã xuất" },
  { value: "pending", label: "Chờ xử lý" },
  { value: "cancelled", label: "Đã hủy" },
];

const columns: ReportColumnConfig[] = [
  txt("sku", "Mã SKU", 140),
  txt("name", "Tên hàng hóa", 220),
  txt("unit", "Đơn vị tính", 100),
  txt("location", "Mã vị trí", 120),
  dateCol("date", "Ngày xuất", 130),
  timeCol("time", "Giờ xuất", 120),
  txt("staff", "Nhân viên xuất", 160),
  num("outQty", "SL xuất", 90),
  num("returnQty", "SL trả", 90),
  num("saleQty", "SL bán", 90),
  num("remainingQty", "SL tồn", 90),
  selectCol("status", "Trạng thái", 170, STATUS_FILTER_OPTIONS),
  txt("invoice", "Hóa đơn bán", 130),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportTemporaryWarehouseOutGoods = tableConfig;
export const chain_tableRegistryReportTemporaryWarehouseOutGoods = tableConfig;

const baseFilterLines = [
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
  REPORT_FILTERS_LINE.WORK_SHIFT,
];
export const single_filterRegistryReportTemporaryWarehouseOutGoods =
  baseFilterLines;
// Chuỗi cửa hàng có thêm line "Cửa hàng" (single-select) để chọn 1 cửa hàng.
export const chain_filterRegistryReportTemporaryWarehouseOutGoods = [
  REPORT_FILTERS_LINE.STORE_SINGLE,
  ...baseFilterLines,
];
