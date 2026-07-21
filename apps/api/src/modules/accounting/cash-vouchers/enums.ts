/**
 * Cash voucher enums. Values mirror the Postgres enum types created in the
 * Phase 1 migration (1781000000000-CashVouchersPhase1). English values only —
 * Vietnamese is reserved for frontend display.
 */

export enum CashVoucherStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export enum CashReceiptPurpose {
  OTHER = 'OTHER',
  DEBT_COLLECTION = 'DEBT_COLLECTION',
  POS_SALE = 'POS_SALE',
  OTHER_INCOME = 'OTHER_INCOME',
}

export enum CashReceiptReferenceType {
  INVOICE = 'INVOICE',
  INVOICE_DEBT = 'INVOICE_DEBT',
  RECEIVABLE = 'RECEIVABLE',
  MANUAL = 'MANUAL',
  REVERSAL = 'REVERSAL',
  /** Counterpart leg of a fund swap (FR-08); reference_id = the swap id. */
  FUND_SWAP = 'FUND_SWAP',
}

export enum CashPaymentPurpose {
  OTHER = 'OTHER',
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  PURCHASE = 'PURCHASE',
  EXPENSE = 'EXPENSE',
  SALARY = 'SALARY',
  REFUND = 'REFUND',
}

export enum CashPaymentReferenceType {
  INVOICE_DEBT = 'INVOICE_DEBT',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  EXPENSE = 'EXPENSE',
  SALARY = 'SALARY',
  REFUND = 'REFUND',
  MANUAL = 'MANUAL',
  REVERSAL = 'REVERSAL',
  /** Counterpart leg of a fund swap (FR-08); reference_id = the swap id. */
  FUND_SWAP = 'FUND_SWAP',
}

/** Which table a merged voucher row came from (`POST /v2/cash-vouchers/search`). */
export enum CashVoucherKind {
  RECEIPT = 'RECEIPT',
  PAYMENT = 'PAYMENT',
}

/**
 * The document type the treasury grid renders. Three values rather than two: a
 * payment whose reference_type is GOODS_RECEIPT is shown as its own type, so the
 * filter has to match what the column displays.
 */
export enum CashVoucherDocumentKind {
  CASH_RECEIPT = 'CASH_RECEIPT',
  CASH_PAYMENT = 'CASH_PAYMENT',
  GOODS_RECEIPT_PAYMENT = 'GOODS_RECEIPT_PAYMENT',
}

export enum CashVoucherPartnerType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  EMPLOYEE = 'EMPLOYEE',
  OTHER = 'OTHER',
}

export enum CashVoucherCategoryDirection {
  IN = 'IN',
  OUT = 'OUT',
}

export enum CashCountStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
}

export enum CashCountVarianceVoucherKind {
  CASH_RECEIPT = 'CASH_RECEIPT',
  CASH_PAYMENT = 'CASH_PAYMENT',
}

/**
 * Lifecycle of a debt-collection saga (thu hồi nợ). The happy path settles the
 * cash receipt + every allocated invoice debt inside one ACID transaction; the
 * saga row is the control/observability handle and supports compensation.
 */
export enum DebtCollectionSagaStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
}
