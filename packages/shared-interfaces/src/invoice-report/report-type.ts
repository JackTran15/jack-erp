/** One selectable report in the "Báo cáo" dropdown. */
export interface InvoiceReportTypeOption {
  key: string;
  name: string;
}

/** Response of the report-types list API. */
export interface InvoiceReportTypesResult {
  types: InvoiceReportTypeOption[];
}

/**
 * Vietnamese display names per report type key. Lives here (not backend source)
 * so the backend report registry stays English; the list handler merges these.
 * Add an entry when a new backend ReportDefinition is registered.
 */
export const REPORT_TYPE_LABELS_VI: Record<string, string> = {
  'daily-sales-summary': 'Tổng hợp bán hàng theo ngày',
  'invoice-order-listing': 'Bảng kê hóa đơn và đơn hàng',
  'invoice-item-revenue-detail': 'Chi tiết doanh thu theo hóa đơn và mặt hàng',
};
