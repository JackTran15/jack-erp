/**
 * Backend report keys of the 4 debt reports (DebtReportDefinition.key). FE
 * maps its REPORT_TYPE_DEBTS enum values onto these via `backendKey`.
 */
export const DEBT_REPORT_KEYS = {
  CUSTOMER_DEBTS: 'customer-debts',
  RECEIVABLES_DETAIL_BY_PRODUCT: 'receivables-detail-by-product',
  SUPPLIER_DEBTS: 'supplier-debts',
  SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT:
    'supplier-debts-detail-by-document-and-product',
} as const;

export type DebtReportKey = (typeof DEBT_REPORT_KEYS)[keyof typeof DEBT_REPORT_KEYS];

export const DEBT_REPORT_TYPE_LABELS_VI: Record<DebtReportKey, string> = {
  [DEBT_REPORT_KEYS.CUSTOMER_DEBTS]: 'Công nợ khách hàng',
  [DEBT_REPORT_KEYS.RECEIVABLES_DETAIL_BY_PRODUCT]:
    'Chi tiết công nợ phải thu theo mặt hàng',
  [DEBT_REPORT_KEYS.SUPPLIER_DEBTS]: 'Công nợ nhà cung cấp',
  [DEBT_REPORT_KEYS.SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT]:
    'Chi tiết công nợ nhà cung cấp theo chứng từ và mặt hàng',
};

/**
 * Vietnamese labels for the FIXED debt-report columns. Lives in
 * shared-interfaces (like INVOICE_REPORT_COLUMN_LABELS_VI) so backend source
 * stays English. Column keys are shared across reports where the underlying
 * concept is identical (e.g. `customerCode`/`supplierCode`, or the period-
 * ledger `debtOpening`/`debtIncrease`/`debtDecrease`/`debtClosing` used by
 * both #1 "Công nợ khách hàng" and #3 "Công nợ nhà cung cấp") — but report #2
 * and #4's per-line delta/cumulative columns are DELIBERATELY separate keys
 * (`lineDebtIncrease`/`lineDebtDecrease` vs `cumulativeDebtIncrease`/
 * `cumulativeDebtDecrease`) because they are computed differently (see
 * docs/24-debt-reports-spec.md) and must never be confused.
 */
export const DEBT_REPORT_COLUMN_LABELS_VI: Record<string, string> = {
  // Party identity — customer-debts / receivables-detail-by-product
  customerCode: 'Mã khách hàng',
  customerName: 'Tên khách hàng',
  customerGroup: 'Nhóm khách hàng',
  customerPhone: 'Số điện thoại',
  customerEmail: 'Email',
  address: 'Địa chỉ',
  membershipCardNumber: 'Mã thẻ thành viên',
  membershipTier: 'Hạng thẻ',

  // Party identity — supplier-debts / supplier-debts-detail-by-document-and-product
  supplierCode: 'Mã NCC',
  supplierName: 'Tên nhà cung cấp',

  // Period ledger — customer-debts (#1) and supplier-debts (#3)
  debtOpening: 'Nợ đầu kỳ',
  debtIncrease: 'Tăng trong kỳ',
  debtDecrease: 'Giảm trong kỳ',
  debtClosing: 'Nợ cuối kỳ',

  // Document/line shared columns — receivables-detail-by-product (#2) and
  // supplier-debts-detail-by-document-and-product (#4)
  date: 'Ngày',
  documentNumber: 'Số chứng từ',
  documentType: 'Loại chứng từ',
  documentDescription: 'Diễn giải',
  sku: 'Mã SKU',
  itemName: 'Tên hàng hóa',
  itemCategory: 'Nhóm hàng hóa',
  unit: 'Đơn vị tính',
  quantity: 'Số lượng',
  unitPrice: 'Đơn giá',
  branchName: 'Chi nhánh',

  // receivables-detail-by-product (#2) only
  revenueGoods: 'Tiền hàng',
  revenuePromotion: 'Khuyến mại',
  revenueTotal: 'Tổng',
  lineCollected: 'Đã thu',
  lineDebtIncrease: 'Nợ tăng',
  lineDebtDecrease: 'Nợ giảm',
  runningBalance: 'Số dư cuối kỳ',

  // supplier-debts-detail-by-document-and-product (#4) only
  lineTotal: 'Thành tiền',
  discountPercent: '% CK',
  discountAmount: 'Tiền CK',
  taxRate: 'Thuế suất',
  taxAmount: 'Tiền thuế',
  paymentAmount: 'Tiền thanh toán',
  cumulativeDebtIncrease: 'Công nợ tăng trong kỳ',
  cumulativeDebtDecrease: 'Công nợ giảm trong kỳ',
  closingBalance: 'Nợ cuối kỳ',
};

/** Formula / sub-label notation per column, matching the confirmed mockups in docs/24-debt-reports-spec.md. */
export const DEBT_REPORT_COLUMN_DESCS: Record<string, string> = {
  // customer-debts (#1) / supplier-debts (#3) — period ledger
  debtOpening: '(1)',
  debtIncrease: '(2)',
  debtDecrease: '(3)',
  debtClosing: '(4)=(1)+(2)-(3)',

  // Shared by receivables-detail-by-product (#2) and
  // supplier-debts-detail-by-document-and-product (#4).
  quantity: '(1)',
  unitPrice: '(2)',

  // receivables-detail-by-product (#2) only — note (5) is deliberately absent,
  // matching a numbering gap in the confirmed mockup (see spec doc).
  revenueGoods: '(3)=(1)*(2)',
  revenuePromotion: '(4)',
  revenueTotal: '(6)=(3)-(4)',
  lineCollected: '(7)',
  lineDebtIncrease: '(8)',
  lineDebtDecrease: '(9)',
  runningBalance: '(10)',

  // supplier-debts-detail-by-document-and-product (#4) only
  lineTotal: '(3)=(1)*(2)',
  discountPercent: '(4)',
  discountAmount: '(5)=(3)*(4)',
  taxRate: '(6)',
  taxAmount: '(7)=[(3)-(5)]*(6)',
  paymentAmount: '(8)=(3)-(5)+(7)',
};
