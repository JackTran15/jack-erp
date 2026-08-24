import { http } from "@erp/pos/lib/common/http";
import type {
  IDropdownOption,
  InvoiceReportResult,
  InvoiceReportSearchPayload,
  PosDailySummaryDetailResult,
  PosDailySummaryResult,
  ReportDocumentPayload,
} from "@erp/shared-interfaces";
import type {
  PosDailySummaryBody,
  PosDailySummaryDetailBody,
  PosDailySummaryExportBody,
  RevenueByItemExportBody,
} from "@erp/pos/dtos/daily-report.dto";

export const dailyReportService = {
  /** `POST /reports/pos/daily-summary` — tab Tổng hợp. */
  getDailySummary: (body: PosDailySummaryBody): Promise<PosDailySummaryResult> =>
    http.post<PosDailySummaryResult>("/reports/pos/daily-summary", body),

  /** `POST /reports/pos/daily-summary/export` — server-generated "BÁO CÁO TỔNG HỢP" .xlsx. */
  exportDailySummary: (body: PosDailySummaryExportBody): Promise<Blob> =>
    http.postBlob("/reports/pos/daily-summary/export", body),

  /** `POST /reports/pos/daily-summary/detail` — "xem chi tiết" drill-down for one summary line item. */
  getDailySummaryDetail: (
    body: PosDailySummaryDetailBody,
  ): Promise<PosDailySummaryDetailResult> =>
    http.post<PosDailySummaryDetailResult>("/reports/pos/daily-summary/detail", body),

  /** `POST /reports/invoices/search` (reportType `revenue-by-item`) — tab Doanh thu theo mặt hàng. */
  searchRevenueByItem: (
    body: InvoiceReportSearchPayload,
  ): Promise<InvoiceReportResult> =>
    http.post<InvoiceReportResult>("/reports/invoices/search", body),

  /** `POST /reports/invoices/export` — "Xuất" cho tab Doanh thu theo mặt hàng, trả .xlsx. */
  exportRevenueByItem: (body: RevenueByItemExportBody): Promise<Blob> =>
    http.postBlob("/reports/invoices/export", body),

  /** `POST /reports/invoices/print-payload` — "In" cho tab Doanh thu theo mặt hàng. */
  getRevenueByItemPrintPayload: (
    body: RevenueByItemExportBody,
  ): Promise<ReportDocumentPayload> =>
    http.post<ReportDocumentPayload>("/reports/invoices/print-payload", body),

  /**
   * `GET /reports/invoices/filter-options` — Thu ngân (`cashier`) / NVBH (`salesperson`).
   *
   * `branchId` ghim danh sách vào chi nhánh đang chọn, kể cả với tài khoản có
   * `iam.user.read.all`. Chỉ set khi có giá trị thật: `?branchId=` rỗng không
   * được `@IsOptional()` bỏ qua mà rơi vào `@IsUUID` và trả 400.
   */
  getFilterOptions: (
    type: string,
    search = "",
    branchId?: string,
  ): Promise<IDropdownOption[]> => {
    const qs = new URLSearchParams({ type });
    if (search) qs.set("search", search);
    if (branchId) qs.set("branchId", branchId);
    qs.set("pageSize", "100");
    return http.get<IDropdownOption[]>(
      `/reports/invoices/filter-options?${qs.toString()}`,
    );
  },
};
