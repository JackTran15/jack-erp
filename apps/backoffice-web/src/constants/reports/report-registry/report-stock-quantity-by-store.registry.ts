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

// Không có dòng kỳ báo cáo: báo cáo này đọc `stock_balances`, tức là tồn tại
// THỜI ĐIỂM HIỆN TẠI, và `StockByStorePivotReport` không đọc `period`/`preset` ở
// bất kỳ đâu. Đo trên erp_dev_3008: cả năm 2026, đúng một ngày, cả năm 2020 và
// `preset=today` đều trả về cùng 9639 dòng. Hai dòng lọc kỳ từng có ở đây chỉ là
// ô lọc hiện ra mà không làm gì (ADR-04). Muốn tồn theo thời điểm quá khứ thì
// phải dựng lại engine trên ledger — là feature riêng, không phải sửa bộ lọc.
const filterLines = [
  REPORT_FILTERS_LINE.PRODUCT_GROUP,
  REPORT_FILTERS_LINE.BRAND,
  REPORT_FILTERS_LINE.STATISTIC_BY,
  REPORT_FILTERS_LINE.UNIT,
];
export const single_filterRegistryReportStockQuantityByStore = filterLines;
export const chain_filterRegistryReportStockQuantityByStore = filterLines;
