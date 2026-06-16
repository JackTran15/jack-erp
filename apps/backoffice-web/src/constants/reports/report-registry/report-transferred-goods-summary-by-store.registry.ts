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
  txt("targetBranch", "Cửa hàng nhận điều chuyển", 220),
  num("outQty", "Số lượng xuất", 130),
  num("outAvgPrice", "Đơn giá xuất trung bình", 160),
  num("outValue", "Giá trị xuất", 140),
  num("inQty", "Số lượng nhập", 130),
  num("inAvgPrice", "Đơn giá nhập trung bình", 160),
  num("inValue", "Giá trị nhập", 140),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportTransferredGoodsSummaryByStore =
  tableConfig;
export const chain_tableRegistryReportTransferredGoodsSummaryByStore =
  tableConfig;

const filterLines = [
  REPORT_FILTERS_LINE.SOURCE_STORE,
  REPORT_FILTERS_LINE.RECEIVING_STORE,
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.UNIT,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
export const single_filterRegistryReportTransferredGoodsSummaryByStore =
  filterLines;
export const chain_filterRegistryReportTransferredGoodsSummaryByStore =
  filterLines;
