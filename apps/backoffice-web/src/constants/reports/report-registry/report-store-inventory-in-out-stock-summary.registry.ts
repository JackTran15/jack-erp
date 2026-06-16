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

const OPENING = "Tồn đầu kỳ";
const IN = "Nhập trong kỳ";
const OUT = "Xuất trong kỳ";
const ENDING = "Tồn cuối kỳ";

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
  txt("branchCode", "Mã cửa hàng", 130),
  txt("branch", "Tên cửa hàng", 180),
  num("openingQty", "Số lượng", 110, OPENING),
  num("openingValue", "Giá trị", 130, OPENING),
  num("inQty", "Số lượng", 110, IN),
  num("inValue", "Giá trị", 130, IN),
  num("outQty", "Số lượng", 110, OUT),
  num("outValue", "Giá trị", 130, OUT),
  num("endingQty", "Số lượng", 110, ENDING),
  num("endingValue", "Giá trị", 140, ENDING),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportStoreInventoryInOutStockSummary =
  tableConfig;
export const chain_tableRegistryReportStoreInventoryInOutStockSummary =
  tableConfig;

const filterLines = [
  REPORT_FILTERS_LINE.STORE,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
export const single_filterRegistryReportStoreInventoryInOutStockSummary =
  filterLines;
export const chain_filterRegistryReportStoreInventoryInOutStockSummary =
  filterLines;
