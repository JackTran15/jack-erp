import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import type {
  ReportColumnConfig,
  ReportColumnTableConfig,
  ReportTableConfig,
} from "../report.interface";

// 2 cột cố định theo 00-intent.md (#6 Chi tiền theo thời gian): "Ngày" là nhãn
// bucket đã định dạng sẵn ở BE (dd/MM/yyyy, Tuần…, MM/yyyy, Quý…, yyyy) và là
// link drill-down sang #5 theo `bucketFrom`/`bucketTo`; dòng tổng chân bảng
// (AC-16). Nguồn sự thật thật sự là GET /reports/cash-fund/columns; đây là
// fallback (xem ReportTableConfigSync).
let order = 0;
const col = (
  column: ReportTableColumn,
  backendField: string,
  tableConfig: ReportColumnTableConfig,
): ReportColumnConfig => ({
  column,
  backendField,
  order: ++order,
  visible: true,
  tableConfig,
});

const columns: ReportColumnConfig[] = [
  col(ReportTableColumn.DATE, "bucket", { width: 200, dataType: "text", link: true }),
  col(ReportTableColumn.EXPENSE_AMOUNT, "amount", {
    width: 160,
    dataType: "number",
    align: "right",
  }),
];

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportExpensesByTime = tableConfig;
export const chain_tableRegistryReportExpensesByTime = tableConfig;

// Không có filter cửa hàng: lấy chi nhánh đang chọn trên header (A-14).
// "Thống kê theo" = bucket thời gian (A-13), "Mục chi" thu hẹp theo một mục (AC-17).
const filterLines = [
  REPORT_FILTERS_LINE.TIME_BUCKET,
  REPORT_FILTERS_LINE.EXPENSE_CATEGORY,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
export const single_filterRegistryReportExpensesByTime = filterLines;
export const chain_filterRegistryReportExpensesByTime = filterLines;
