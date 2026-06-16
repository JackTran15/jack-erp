import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import type { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// NOTE: Báo cáo gốc còn có cột động theo từng cửa hàng (branch_<id>) dựng từ
// `branches[]` của response. Kiến trúc registry tĩnh chưa hỗ trợ cột theo data
// → tạm chỉ cột tĩnh + tổng tồn ("total"). Cần cơ chế inject cột riêng nếu muốn.

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
  num("total", "Tồn cuối kỳ", 120),
];
columns[0].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportStockQuantityByStore = tableConfig;
export const chain_tableRegistryReportStockQuantityByStore = tableConfig;

const filterLines = [
  REPORT_FILTERS_LINE.STORE,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
export const single_filterRegistryReportStockQuantityByStore = filterLines;
export const chain_filterRegistryReportStockQuantityByStore = filterLines;
