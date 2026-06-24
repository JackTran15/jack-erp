import { ReportFilterOption } from './options';

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

/** Filter widget the FE renders for a column's per-column filter row. */
export type ReportColumnFilterKind =
  | 'text'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'none';

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
  /** Filter widget kind for this column's filter row. */
  filterKind: ReportColumnFilterKind;
  /** Options for a `select` filter column (e.g. status); omitted otherwise. */
  filterOptions?: ReportFilterOption[];
  /** Horizontal alignment; number-family columns are right-aligned. */
  align?: 'left' | 'right' | 'center';
  /** Sticky/pinned side; null/absent = not pinned. */
  pinned?: 'left' | 'right' | null;
  /** Whether the cell renders as a link (e.g. invoice code). */
  link?: boolean;
  /** Suggested column width in px. */
  width?: number;
}

/** Response of the columns API — full catalog + the footer summary label. */
export interface InvoiceReportColumnsResult {
  /** Footer first-cell label for the totals row, e.g. "Tổng". */
  summaryLabel: string;
  columns: ReportColumnHeader[];
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
  // Invoice-order-listing report (per-invoice) — additive keys.
  time: 'Giờ',
  invoiceCode: 'Số hóa đơn',
  status: 'Trạng thái',
  'revenue.fee': 'Tiền phí',
  'payment.debt': 'Công nợ',
  'payment.collectOnBehalf': 'Thu hộ',
  'payment.cash': 'Tiền mặt',
  'payment.bankTransfer': 'Tiền gửi NH',
  'payment.bankAccount': 'Tài khoản ngân hàng',
  customer: 'Khách hàng',
  customerPhone: 'Số điện thoại',
  salesChannel: 'Kênh bán hàng',
  cashier: 'Thu ngân',
  salesperson: 'NV bán hàng',
  note: 'Ghi chú',
  storeCode: 'Mã cửa hàng',
  'platform.fee': 'Phí trả sàn',
  'platform.otherIncome': 'Thu khác từ sàn',
  'platform.revenue': 'Doanh thu từ sàn',
  // Invoice-item revenue-detail report (per-line-item) — additive keys.
  sku: 'Mã SKU',
  itemName: 'Tên hàng hóa',
  itemCategory: 'Nhóm hàng hóa',
  brand: 'Thương hiệu',
  unit: 'Đơn vị tính',
  quantity: 'Số lượng',
  unitPrice: 'Đơn giá',
  lineAmount: 'Tiền hàng',
  lineDiscount: 'Tiền KM',
  lineRevenue: 'Doanh thu',
  reference: 'Tham chiếu',
  locationCode: 'Mã vị trí',
  locationName: 'Tên vị trí',
  customerCode: 'Mã khách hàng',
  customerGroup: 'Nhóm khách hàng',
  cashierCode: 'Mã Thu ngân',
  salespersonCode: 'Mã NV bán hàng',
  receiver: 'Người nhận',
  receiverPhone: 'SĐT người nhận',
  storeName: 'Tên cửa hàng',
  invoiceNote: 'Ghi chú hóa đơn',
  itemNote: 'Ghi chú hàng hóa',
  supplier: 'Nhà cung cấp',
};

/** Vietnamese band (group) labels for the two-tier header. */
export const INVOICE_REPORT_BAND_LABELS_VI: Record<string, string> = {
  revenue: 'Doanh thu',
  customerPayment: 'Khách hàng thanh toán',
  platform: 'Doanh thu sàn TMĐT',
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
