/**
 * Backend report keys of the 5 cash-fund ("Quỹ tiền") reports
 * (CashFundReportDefinition.key). FE maps its REPORT_TYPE_CASH_FUND enum values
 * onto these via `backendKey`. The sixth MShopKeeper report (shift handover) is
 * deferred — see .ai/features/2026091802-cash-fund-reports/00-intent.md.
 */
export const CASH_FUND_REPORT_KEYS = {
  CASH_IN_OUT_SITUATION: 'cash-in-out-situation',
  CASH_IN_OUT_LIST: 'cash-in-out-list',
  EXPENSES_BY_CATEGORY: 'expenses-by-category',
  EXPENSE_LIST_BY_CATEGORY: 'expense-list-by-category',
  EXPENSES_BY_TIME: 'expenses-by-time',
} as const;

export type CashFundReportKey =
  (typeof CASH_FUND_REPORT_KEYS)[keyof typeof CASH_FUND_REPORT_KEYS];

/** Screen titles, worded exactly as the reference app names them (A-08). */
export const CASH_FUND_REPORT_TYPE_LABELS_VI: Record<CashFundReportKey, string> = {
  [CASH_FUND_REPORT_KEYS.CASH_IN_OUT_SITUATION]: 'Tình hình thu chi',
  [CASH_FUND_REPORT_KEYS.CASH_IN_OUT_LIST]: 'Bảng kê thu chi',
  [CASH_FUND_REPORT_KEYS.EXPENSES_BY_CATEGORY]: 'Chi tiền theo mục chi',
  [CASH_FUND_REPORT_KEYS.EXPENSE_LIST_BY_CATEGORY]: 'Bảng kê tiền chi theo mục chi',
  [CASH_FUND_REPORT_KEYS.EXPENSES_BY_TIME]: 'Chi tiền theo thời gian',
};

/** Which fund a voucher moves: the cash drawer or a deposit (bank) account. */
export type CashFundKind = 'cash' | 'deposit';

/** The four voucher tables a cash-fund ledger row can come from. */
export type CashFundDocumentKind =
  | 'CASH_RECEIPT'
  | 'CASH_PAYMENT'
  | 'BANK_RECEIPT'
  | 'BANK_PAYMENT';

export const CASH_FUND_DOCUMENT_KIND_LABELS_VI: Record<CashFundDocumentKind, string> = {
  CASH_RECEIPT: 'Phiếu thu',
  CASH_PAYMENT: 'Phiếu chi',
  BANK_RECEIPT: 'Thu tiền gửi',
  BANK_PAYMENT: 'Chi tiền gửi',
};

export const CASH_FUND_KIND_LABELS_VI: Record<CashFundKind, string> = {
  cash: 'Tiền mặt',
  deposit: 'Chuyển khoản',
};

/** Bucket of "Chi tiền theo thời gian" (`date_trunc` on the voucher date). */
export type CashFundTimeBucket = 'day' | 'week' | 'month' | 'quarter' | 'year';

export const CASH_FUND_TIME_BUCKETS: readonly CashFundTimeBucket[] = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
];

export const CASH_FUND_TIME_BUCKET_LABELS_VI: Record<CashFundTimeBucket, string> = {
  day: 'Ngày',
  week: 'Tuần',
  month: 'Tháng',
  quarter: 'Quý',
  year: 'Năm',
};

/**
 * Vietnamese labels for the FIXED cash-fund report columns. Column keys are
 * shared across the five reports where the concept is identical (a voucher's
 * `docDate`, `documentNumber`, `staffName`, …); the three summary columns of
 * "Tình hình thu chi" (`cash` / `deposit` / `total`) and the aggregate `amount`
 * of the expense reports are deliberately separate keys because they are sums
 * over different things.
 */
export const CASH_FUND_REPORT_COLUMN_LABELS_VI: Record<string, string> = {
  // cash-in-out-situation
  lineLabel: 'Khoản mục',
  cash: 'Tiền mặt',
  deposit: 'Tiền gửi',
  total: 'Tổng cộng',

  // cash-in-out-list / expense-list-by-category — one row per voucher (or line)
  docDate: 'Ngày chứng từ',
  documentNumber: 'Số chứng từ',
  documentKind: 'Loại chứng từ',
  reference: 'Tham chiếu',
  amountIn: 'Tiền thu',
  amountOut: 'Tiền chi',
  runningBalance: 'Số dư cuối kỳ',
  paymentMethod: 'Phương thức thanh toán',
  depositAccount: 'Tài khoản ngân hàng',
  staffName: 'Nhân viên thu/chi',
  partnerCode: 'Mã đối tượng',
  partnerName: 'Đối tượng nộp/nhận',
  payeeName: 'Người nhận',
  reason: 'Diễn giải',
  branchCode: 'Mã cửa hàng',
  branchName: 'Tên cửa hàng',
  invoiceNumber: 'Số hóa đơn',

  // expenses-by-category / expense-list-by-category / expenses-by-time
  categoryId: 'ID Mục chi',
  categoryName: 'Mục chi',
  categoryKind: 'Loại Mục chi',
  amount: 'Số tiền chi',
  bucket: 'Ngày',
};

/**
 * Hidden row keys carried on every row of these reports so the frontend can
 * style hierarchical rows and resolve drill-downs without a second contract.
 * Not catalogue columns: the table renders `columns`, so they never show up.
 */
export const CASH_FUND_ROW_KEYS = {
  /** 'opening' | 'grandTotal' | 'group' | 'detail' | 'line' */
  ROW_KIND: 'rowKind',
  /** Stable key of a "Tình hình thu chi" line (`opening`, `inSales`, `outCategory:<id>`, …). */
  LINE_KEY: 'lineKey',
  BOLD: 'bold',
  INDENT_LEVEL: 'indentLevel',
  CATEGORY_ID: 'categoryId',
  VOUCHER_ID: 'voucherId',
  VOUCHER_KIND: 'voucherKind',
  BUCKET_FROM: 'bucketFrom',
  BUCKET_TO: 'bucketTo',
} as const;

/** `categoryIds` value that selects lines with no category ("Chi khác"). */
export const CASH_FUND_UNCATEGORIZED = 'uncategorized';
