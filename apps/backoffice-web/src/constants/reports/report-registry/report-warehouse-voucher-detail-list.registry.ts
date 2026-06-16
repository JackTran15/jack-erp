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
  group?: string,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  group,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "number", align: "right" },
});

const IN = "Nhập kho";
const OUT = "Xuất kho";

const columns: ReportColumnConfig[] = [
  txt("date", "Ngày chứng từ", 140),
  txt("documentType", "Loại chứng từ", 200),
  txt("warehouse", "Kho", 180),
  txt("documentNumber", "Số chứng từ", 130),
  txt("reference", "Tham chiếu", 120),
  txt("sku", "Mã SKU", 140),
  txt("name", "Tên hàng hóa", 220),
  txt("unit", "Đơn vị tính", 110),
  txt("notes", "Ghi chú hàng hóa", 160),
  txt("group", "Nhóm hàng hóa", 140),
  txt("parentSku", "SKU mẫu mã", 130),
  txt("parentName", "Tên mẫu mã", 130),
  txt("color", "Màu sắc", 100),
  txt("size", "Size", 80),
  num("inQty", "Số lượng", 110, IN),
  num("inUnitPrice", "Đơn giá", 120, IN),
  num("inValue", "Giá trị", 130, IN),
  num("inSalePrice", "Giá bán", 120, IN),
  num("outQty", "Số lượng", 110, OUT),
  num("outUnitPrice", "Đơn giá", 120, OUT),
  num("outValue", "Giá trị", 130, OUT),
  num("outSalePrice", "Giá bán", 120, OUT),
  txt("customer", "Đối tượng", 160),
  txt("branchCode", "Mã cửa hàng", 130),
  txt("branchName", "Tên cửa hàng", 180),
  txt("receiverBranchCode", "Mã cửa hàng nhận", 160),
  txt("receiverBranchName", "Tên cửa hàng nhận", 180),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportWarehouseVoucherDetailList = tableConfig;
export const chain_tableRegistryReportWarehouseVoucherDetailList = tableConfig;

const filterLines = [
  REPORT_FILTERS_LINE.STORE,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
export const single_filterRegistryReportWarehouseVoucherDetailList = filterLines;
export const chain_filterRegistryReportWarehouseVoucherDetailList = filterLines;
