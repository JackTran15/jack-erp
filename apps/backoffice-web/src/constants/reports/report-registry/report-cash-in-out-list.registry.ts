import {
  CASH_FUND_DOCUMENT_KIND_LABELS_VI,
  CASH_FUND_KIND_LABELS_VI,
} from "@erp/shared-interfaces";
import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import type {
  ReportColumnConfig,
  ReportColumnTableConfig,
  ReportTableConfig,
} from "../report.interface";

// 16 cột cố định theo 00-intent.md (#3 Bảng kê thu chi): 4 cột đầu ghim trái,
// "Mã đối tượng" và "Số hóa đơn" ẩn mặc định (bật trong "Sửa mẫu"), "Số chứng
// từ" là link mở phiếu. Dòng 0 của trang 1 là "Số dư đầu kỳ" (rowKind=opening),
// "Số dư cuối kỳ" luỹ kế theo ngày chứng từ (ADR-02). Nguồn sự thật thật sự là
// GET /reports/cash-fund/columns; đây là fallback (xem ReportTableConfigSync).
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

const money: ReportColumnTableConfig = { width: 140, dataType: "number", align: "right" };

const columns: ReportColumnConfig[] = [
  col(ReportTableColumn.DOC_DATE, "docDate", { width: 120, pinned: "left", dataType: "date" }),
  col(ReportTableColumn.DOCUMENT_NUMBER, "documentNumber", {
    width: 140,
    pinned: "left",
    dataType: "text",
    link: true,
  }),
  col(ReportTableColumn.DOCUMENT_TYPE, "documentKind", {
    width: 130,
    pinned: "left",
    dataType: "text",
    filterKind: "select",
    filterOptions: toOptions(CASH_FUND_DOCUMENT_KIND_LABELS_VI),
  }),
  col(ReportTableColumn.REFERENCE, "reference", { width: 160, pinned: "left", dataType: "text" }),
  col(ReportTableColumn.AMOUNT_IN, "amountIn", money),
  col(ReportTableColumn.AMOUNT_OUT, "amountOut", money),
  col(ReportTableColumn.RUNNING_BALANCE, "runningBalance", { ...money, filterKind: "none" }),
  col(ReportTableColumn.PAYMENT_METHOD, "paymentMethod", {
    width: 150,
    dataType: "text",
    filterKind: "select",
    filterOptions: toOptions(CASH_FUND_KIND_LABELS_VI),
  }),
  col(ReportTableColumn.DEPOSIT_ACCOUNT, "depositAccount", { width: 180, dataType: "text" }),
  col(ReportTableColumn.STAFF_NAME, "staffName", { width: 160, dataType: "text" }),
  col(ReportTableColumn.PARTNER_CODE, "partnerCode", { width: 130, dataType: "text" }, false),
  col(ReportTableColumn.PARTNER_NAME, "partnerName", { width: 180, dataType: "text" }),
  col(ReportTableColumn.DOCUMENT_DESCRIPTION, "reason", { width: 220, dataType: "text" }),
  col(ReportTableColumn.STORE_CODE, "branchCode", { width: 120, dataType: "text" }),
  col(ReportTableColumn.STORE_NAME, "branchName", { width: 180, dataType: "text" }),
  col(ReportTableColumn.INVOICE_NUMBER, "invoiceNumber", { width: 140, dataType: "text" }, false),
];

// Chân bảng: Tiền thu / Tiền chi (BE `totals`), các ô khác null.
const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportCashInOutList = tableConfig;
export const chain_tableRegistryReportCashInOutList = tableConfig;

// SINGLE: cửa hàng cố định theo chi nhánh header (buildCashFundSearchFilters gửi
// `branchId`); CHAIN: thêm dòng Cửa hàng (Tất cả | Theo nhóm cửa hàng) → `store` (A-14).
const singleFilterLines = [
  REPORT_FILTERS_LINE.EMPLOYEE,
  REPORT_FILTERS_LINE.PAYMENT_METHOD,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
const chainFilterLines = [REPORT_FILTERS_LINE.STORE, ...singleFilterLines];
export const single_filterRegistryReportCashInOutList = singleFilterLines;
export const chain_filterRegistryReportCashInOutList = chainFilterLines;
