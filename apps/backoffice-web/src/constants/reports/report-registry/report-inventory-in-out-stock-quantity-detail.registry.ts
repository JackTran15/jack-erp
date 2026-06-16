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

const IN = "Nhập trong kỳ";
const OUT = "Xuất trong kỳ";

const columns: ReportColumnConfig[] = [
  txt("sku", "Mã SKU", 140),
  txt("name", "Tên hàng hóa", 220),
  txt("parentSku", "Mã SKU mẫu mã", 140),
  txt("parentName", "Tên Mẫu mã", 150),
  txt("color", "Màu sắc", 100),
  txt("size", "Size", 80),
  txt("unit", "Đơn vị tính", 110),
  txt("group", "Nhóm hàng hóa", 140),
  txt("brand", "Thương hiệu", 120),
  num("openingQty", "Tồn đầu kỳ", 110),
  num("inTotal", "Tổng", 100, IN),
  num("inPurchase", "Mua hàng", 110, IN),
  num("inTransfer", "Điều chuyển", 120, IN),
  num("inReturn", "Hàng trả lại", 120, IN),
  num("inWh", "Chuyển kho", 110, IN),
  num("inAdjust", "Kiểm kê", 110, IN),
  num("inOther", "Khác", 100, IN),
  num("outTotal", "Tổng", 100, OUT),
  num("outSale", "Bán hàng", 110, OUT),
  num("outTransfer", "Điều chuyển", 120, OUT),
  num("outPurchaseReturn", "Trả lại hàng mua", 140, OUT),
  num("outWh", "Chuyển kho", 110, OUT),
  num("outAdjust", "Kiểm kê", 110, OUT),
  num("outVoid", "Hủy hàng", 110, OUT),
  num("outOther", "Khác", 100, OUT),
  num("endingQty", "Tồn cuối kỳ", 120),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportInventoryInOutStockQuantityDetail =
  tableConfig;
export const chain_tableRegistryReportInventoryInOutStockQuantityDetail =
  tableConfig;

const filterLines = [
  REPORT_FILTERS_LINE.STORE,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
export const single_filterRegistryReportInventoryInOutStockQuantityDetail =
  filterLines;
export const chain_filterRegistryReportInventoryInOutStockQuantityDetail =
  filterLines;
