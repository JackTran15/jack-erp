import { CASH_FUND_KIND_LABELS_VI } from "@erp/shared-interfaces";
import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import type {
  ReportColumnConfig,
  ReportColumnTableConfig,
  ReportTableConfig,
} from "../report.interface";

// 14 cột theo thứ tự BE (#5 Bảng kê tiền chi theo mục chi): 2 cột đầu ghim
// trái, "Số chứng từ" là link mở phiếu, "Mã đối tượng" / "Số hóa đơn" / "Mục
// chi" ẩn mặc định (bật trong "Sửa mẫu"; "Mục chi" đã là dòng nhóm nên không
// cần hiện lại trên từng dòng). Dòng "TỔNG CHI" trên cùng, mỗi mục chi một
// dòng nhóm (bold) rồi các dòng chi tiết thụt lề (rowKind / indentLevel do BE
// gắn, AC-14); phân trang trên danh sách đã làm phẳng. Nguồn sự thật thật sự
// là GET /reports/cash-fund/columns; đây là fallback + cờ ẩn/ghim.
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

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const columns: ReportColumnConfig[] = [
  col(ReportTableColumn.DOC_DATE, "docDate", { width: 120, pinned: "left", dataType: "date" }),
  col(ReportTableColumn.DOCUMENT_NUMBER, "documentNumber", {
    width: 140,
    pinned: "left",
    dataType: "text",
    link: true,
  }),
  col(ReportTableColumn.DEPOSIT_ACCOUNT, "depositAccount", { width: 180, dataType: "text" }),
  col(ReportTableColumn.PAYMENT_METHOD, "paymentMethod", {
    width: 150,
    dataType: "text",
    filterKind: "select",
    filterOptions: toOptions(CASH_FUND_KIND_LABELS_VI),
  }),
  col(ReportTableColumn.DOCUMENT_DESCRIPTION, "reason", { width: 220, dataType: "text" }),
  col(ReportTableColumn.EXPENSE_AMOUNT, "amount", {
    width: 140,
    dataType: "number",
    align: "right",
  }),
  col(ReportTableColumn.PARTNER_CODE, "partnerCode", { width: 130, dataType: "text" }, false),
  col(ReportTableColumn.PARTNER_NAME, "partnerName", { width: 180, dataType: "text" }),
  col(ReportTableColumn.PAYEE_NAME, "payeeName", { width: 160, dataType: "text" }),
  col(ReportTableColumn.STAFF_NAME, "staffName", { width: 160, dataType: "text" }),
  col(ReportTableColumn.STORE_CODE, "branchCode", { width: 120, dataType: "text" }),
  col(ReportTableColumn.STORE_NAME, "branchName", { width: 180, dataType: "text" }),
  col(ReportTableColumn.INVOICE_NUMBER, "invoiceNumber", { width: 140, dataType: "text" }, false),
  col(ReportTableColumn.CATEGORY_NAME, "categoryName", { width: 180, dataType: "text" }, false),
];

// Chân bảng: Giá trị (BE `totals`), các ô khác null.
const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportExpenseListByCategory = tableConfig;
export const chain_tableRegistryReportExpenseListByCategory = tableConfig;

// SINGLE: cửa hàng cố định theo chi nhánh header (buildCashFundSearchFilters gửi
// `branchId`); CHAIN: thêm dòng Cửa hàng (Tất cả | Theo nhóm cửa hàng) → `store` (A-14).
const singleFilterLines = [
  REPORT_FILTERS_LINE.EMPLOYEE,
  REPORT_FILTERS_LINE.PAYMENT_METHOD,
  REPORT_FILTERS_LINE.EXPENSE_CATEGORY,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
const chainFilterLines = [REPORT_FILTERS_LINE.STORE, ...singleFilterLines];
export const single_filterRegistryReportExpenseListByCategory = singleFilterLines;
export const chain_filterRegistryReportExpenseListByCategory = chainFilterLines;
