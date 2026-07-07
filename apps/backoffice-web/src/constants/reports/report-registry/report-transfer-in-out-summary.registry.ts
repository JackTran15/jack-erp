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
  group: string,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  group,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "number", align: "right" },
});

const G_IN = "Nhập kho điều chuyển";
const G_OUT = "Xuất kho điều chuyển";
const G_RECEIVED = "Cửa hàng khác thực nhận về";
const G_DIFF = "Chênh lệch thực nhận";
const G_INOUT = "Chênh lệch nhập xuất điều chuyển";

const columns: ReportColumnConfig[] = [
  txt("branchCode", "Mã cửa hàng", 130),
  txt("branchName", "Tên cửa hàng", 220),
  num("inQty", "Số lượng", 110, G_IN),
  num("inValue", "Giá trị", 130, G_IN),
  num("outQty", "Số lượng", 110, G_OUT),
  num("outValue", "Giá trị", 130, G_OUT),
  num("receivedQty", "Số lượng", 110, G_RECEIVED),
  num("receivedValue", "Giá trị", 130, G_RECEIVED),
  num("diffQty", "Số lượng", 110, G_DIFF),
  num("diffValue", "Giá trị", 130, G_DIFF),
  num("inOutDiffQty", "Số lượng", 110, G_INOUT),
  num("inOutDiffValue", "Giá trị", 130, G_INOUT),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportTransferInOutSummary = tableConfig;
export const chain_tableRegistryReportTransferInOutSummary = tableConfig;

// SINGLE: cửa hàng cố định theo header → không có dòng Cửa hàng; CHAIN: có.
const singleFilterLines = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
const chainFilterLines = [REPORT_FILTERS_LINE.STORE, ...singleFilterLines];
export const single_filterRegistryReportTransferInOutSummary = singleFilterLines;
export const chain_filterRegistryReportTransferInOutSummary = chainFilterLines;
