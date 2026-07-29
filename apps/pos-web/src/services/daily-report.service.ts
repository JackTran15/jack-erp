import { http } from "@erp/pos/lib/common/http";
import type {
  IDropdownOption,
  InvoiceReportResult,
  InvoiceReportSearchPayload,
  PosDailySummaryDetailResult,
  PosDailySummaryResult,
} from "@erp/shared-interfaces";
import type {
  PosDailySummaryBody,
  PosDailySummaryDetailBody,
  PosDailySummaryExportBody,
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

  /** `GET /reports/invoices/filter-options` — Thu ngân (`cashier`) / NVBH (`salesperson`). */
  getFilterOptions: (
    type: string,
    search = "",
  ): Promise<IDropdownOption[]> => {
    const qs = new URLSearchParams({ type });
    if (search) qs.set("search", search);
    qs.set("pageSize", "100");
    return http.get<IDropdownOption[]>(
      `/reports/invoices/filter-options?${qs.toString()}`,
    );
  },
};
