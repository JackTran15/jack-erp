import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import type {
  ReportColumnConfig,
  ReportColumnTableConfig,
  ReportTableConfig,
} from "../report.interface";

// 4 cột cố định theo 00-intent.md (#4 Chi tiền theo mục chi): "ID Mục chi" và
// "Loại Mục chi" ẩn mặc định (bật trong "Sửa mẫu"), "Mục chi" là link drill-down
// sang #5, sắp theo Số tiền chi giảm dần, dòng tổng chân bảng (AC-12). Nguồn sự
// thật thật sự là GET /reports/cash-fund/columns; đây là fallback + cờ ẩn
// (xem ReportTableConfigSync).
let order = 0;
const col = (
  column: ReportTableColumn,
  backendField: string,
  tableConfig: ReportColumnTableConfig,
  visible = true,
): ReportColumnConfig => ({
  column,
  backendField,
  order: ++order,
  visible,
  tableConfig,
});

const columns: ReportColumnConfig[] = [
  col(ReportTableColumn.CATEGORY_ID, "categoryId", { width: 260, dataType: "text" }, false),
  col(ReportTableColumn.CATEGORY_NAME, "categoryName", {
    width: 260,
    dataType: "text",
    link: true,
  }),
  col(ReportTableColumn.CATEGORY_KIND, "categoryKind", { width: 140, dataType: "text" }, false),
  col(ReportTableColumn.EXPENSE_AMOUNT, "amount", {
    width: 160,
    dataType: "number",
    align: "right",
  }),
];

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportExpensesByCategory = tableConfig;
export const chain_tableRegistryReportExpensesByCategory = tableConfig;

// Không có filter cửa hàng: lấy chi nhánh đang chọn trên header (A-14) —
// buildCashFundSearchFilters gửi `branchId`, null khi xem theo Chuỗi.
const filterLines = [REPORT_FILTERS_LINE.REPORT_PERIOD, REPORT_FILTERS_LINE.RANGE_DATE];
export const single_filterRegistryReportExpensesByCategory = filterLines;
export const chain_filterRegistryReportExpensesByCategory = filterLines;
