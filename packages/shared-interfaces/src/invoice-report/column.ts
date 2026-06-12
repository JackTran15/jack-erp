/** Data type of a report column — drives FE vi-VN formatting, alignment and filter widget. */
export enum ReportColumnDataType {
  STRING = 'string',
  NUMBER = 'number',
  CURRENCY = 'currency',
  PERCENT = 'percent',
  DATE = 'date',
  DATETIME = 'datetime',
  ENUM = 'enum',
  BOOLEAN = 'boolean',
}

/** Band header a column belongs to (colspan group in the two-tier header). */
export interface ReportColumnGroup {
  id: string;
  name: string;
}

/** One column descriptor returned by the catalog (GET columns) API. */
export interface ReportColumnHeader {
  /** Stable key, e.g. "date" | "revenue.total" | "payment.method.<coaAccountId>". */
  col: string;
  /** Display label (VI for fixed columns; PaymentAccount.label for dynamic ones). */
  name: string | null;
  /** Formula / sub-label shown under the name, e.g. "(1)=(3)-(5)-(14)". */
  desc: string | null;
  type: ReportColumnDataType;
  /** Band; null for ungrouped leading columns (date, actualRevenue). */
  group: ReportColumnGroup | null;
}

/** Response of the columns API — only the full catalog, no data. */
export interface InvoiceReportColumnsResult {
  headers: ReportColumnHeader[];
}

/**
 * Vietnamese labels for the FIXED report columns. Lives in shared-interfaces
 * (like PERMISSION_LABELS_VI) so backend source stays English. Dynamic
 * payment columns take their name from PaymentAccount.label instead.
 */
export const INVOICE_REPORT_COLUMN_LABELS_VI: Record<string, string> = {
  date: 'Ngày',
  actualRevenue: 'Thực thu',
  'revenue.goods': 'Tiền hàng',
  'revenue.discount': 'Khuyến mại',
  'revenue.promoPoints': 'Điểm KM',
  'revenue.total': 'Tổng',
  'revenue.promoRate': 'Tỷ lệ KM (%)',
  'revenue.cash': 'Tiền mặt',
  'payment.voucher': 'Voucher',
  'payment.points': 'Điểm',
};

/** Vietnamese band (group) labels for the two-tier header. */
export const INVOICE_REPORT_BAND_LABELS_VI: Record<string, string> = {
  revenue: 'Doanh thu',
  customerPayment: 'Khách hàng thanh toán',
};

/** Formula / sub-label notation per fixed column (not prose — safe anywhere). */
export const INVOICE_REPORT_COLUMN_DESCS: Record<string, string> = {
  actualRevenue: '(13)',
  'revenue.goods': '(3)',
  'revenue.discount': '(5)',
  'revenue.promoPoints': '(14)',
  'revenue.total': '(1)=(3)-(5)-(14)',
  'revenue.promoRate': '(6)',
  'revenue.cash': '(7)',
  'payment.voucher': '(9)',
  'payment.points': '(10)',
};
