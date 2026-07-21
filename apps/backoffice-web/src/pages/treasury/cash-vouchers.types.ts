export enum CashVoucherStatus {
  DRAFT = "DRAFT",
  POSTED = "POSTED",
  REVERSED = "REVERSED",
}

export enum CashReceiptPurpose {
  OTHER = "OTHER",
  DEBT_COLLECTION = "DEBT_COLLECTION",
  POS_SALE = "POS_SALE",
  OTHER_INCOME = "OTHER_INCOME",
  INTER_BRANCH_IN = "INTER_BRANCH_IN",
}

export enum CashReceiptReferenceType {
  INVOICE = "INVOICE",
  INVOICE_DEBT = "INVOICE_DEBT",
  RECEIVABLE = "RECEIVABLE",
  MANUAL = "MANUAL",
  REVERSAL = "REVERSAL",
  FUND_SWAP = "FUND_SWAP",
  TRANSFER = "TRANSFER",
}

export enum CashPaymentPurpose {
  OTHER = "OTHER",
  SUPPLIER_PAYMENT = "SUPPLIER_PAYMENT",
  PURCHASE = "PURCHASE",
  EXPENSE = "EXPENSE",
  SALARY = "SALARY",
  REFUND = "REFUND",
  DEPOSIT_TRANSFER = "DEPOSIT_TRANSFER",
  INTER_BRANCH_OUT = "INTER_BRANCH_OUT",
}

export enum CashPaymentReferenceType {
  INVOICE_DEBT = "INVOICE_DEBT",
  GOODS_RECEIPT = "GOODS_RECEIPT",
  EXPENSE = "EXPENSE",
  SALARY = "SALARY",
  REFUND = "REFUND",
  MANUAL = "MANUAL",
  REVERSAL = "REVERSAL",
  FUND_SWAP = "FUND_SWAP",
  TRANSFER = "TRANSFER",
}

/** Where an inter-branch cash transfer lands at the destination branch. */
export enum CashTransferFundKind {
  CASH = "CASH",
  DEPOSIT = "DEPOSIT",
}

export enum CashVoucherPartnerType {
  CUSTOMER = "CUSTOMER",
  SUPPLIER = "SUPPLIER",
  EMPLOYEE = "EMPLOYEE",
  OTHER = "OTHER",
}

export enum CashCountStatus {
  DRAFT = "DRAFT",
  POSTED = "POSTED",
}

export enum CashCountVarianceVoucherKind {
  CASH_RECEIPT = "CASH_RECEIPT",
  CASH_PAYMENT = "CASH_PAYMENT",
}

export enum CashVoucherCategoryDirection {
  IN = "IN",
  OUT = "OUT",
}

export interface BaseRecord {
  id: string;
  organizationId: string;
  branchId?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface CashReceiptLine extends BaseRecord {
  cashReceiptId: string;
  lineOrder: number;
  description: string;
  categoryId?: string;
  amount: number;
  referenceNote?: string;
}

export interface CashPaymentLine extends BaseRecord {
  cashPaymentId: string;
  lineOrder: number;
  description: string;
  categoryId?: string;
  amount: number;
  referenceNote?: string;
}

export interface VoucherSourceLink {
  sourceType: string;
  sourceId: string;
  sourceDocumentNumber: string | null;
}

export interface CashReceipt extends BaseRecord {
  documentNumber?: string;
  voucherDate: string;
  status: CashVoucherStatus;
  purpose: CashReceiptPurpose;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerNameSnapshot?: string;
  partnerAddressSnapshot?: string;
  payerName?: string;
  reason?: string;
  staffId?: string;
  referenceType?: CashReceiptReferenceType;
  referenceId?: string;
  cashAccountId: string;
  contraAccountId: string;
  totalAmount: number;
  attachmentIds?: string[];
  cashMovementId?: string;
  journalEntryId?: string;
  lines?: CashReceiptLine[];
  sourceLink?: VoucherSourceLink | null;
}

export interface CashPayment extends BaseRecord {
  documentNumber?: string;
  voucherDate: string;
  status: CashVoucherStatus;
  purpose: CashPaymentPurpose;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerNameSnapshot?: string;
  partnerAddressSnapshot?: string;
  payeeName?: string;
  reason?: string;
  staffId?: string;
  referenceType?: CashPaymentReferenceType;
  referenceId?: string;
  cashAccountId: string;
  contraAccountId: string;
  totalAmount: number;
  attachmentIds?: string[];
  cashMovementId?: string;
  journalEntryId?: string;
  lines?: CashPaymentLine[];
  sourceLink?: VoucherSourceLink | null;
}

export interface PaginatedList<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CashCountDenomination {
  denom: number;
  count: number;
  description?: string;
}

export interface CashCount extends BaseRecord {
  documentNumber?: string;
  cashAccountId: string;
  countedAt: string;
  expectedAmount?: number;
  actualAmount: number;
  variance?: number;
  status: CashCountStatus;
  purpose?: string;
  notes?: string;
  denominations?: CashCountDenomination[];
  varianceCashMovementId?: string;
  varianceVoucherKind?: CashCountVarianceVoucherKind;
  varianceVoucherId?: string;
  postedAt?: string;
  postedBy?: string;
  currentBalance?: number;
}

export interface CashCountPostResult extends CashCount {
  varianceVoucher: {
    id: string;
    kind: CashCountVarianceVoucherKind;
    documentNumber: string;
  } | null;
}

export interface CashAccount extends BaseRecord {
  name: string;
  type: "REGISTER" | "SAFE" | "PETTY_CASH";
  balance: number;
  accountId: string;
}

export interface CashAccountsListResponse {
  data: CashAccount[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface CashVoucherCategory extends BaseRecord {
  code?: string;
  name: string;
  direction: CashVoucherCategoryDirection;
  isActive?: boolean;
}

export interface CoaAccount extends BaseRecord {
  code: string;
  name: string;
  isActive?: boolean;
}

export interface CashLedgerRow {
  movementId: string;
  date: string;
  type: string;
  voucherId: string | null;
  /** Null when the movement has no voucher; the UI supplies the placeholder. */
  voucherNumber: string | null;
  kind: "PT" | "PC" | "Khác";
  description: string | null;
  partnerName: string | null;
  staffName: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface CashLedgerResult {
  openingBalance: number;
  pageOpeningBalance: number;
  rows: CashLedgerRow[];
  pageClosingBalance: number;
  total: number;
  page: number;
  pageSize: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
}

export enum ReceiptPaymentKind {
  RECEIPT = "RECEIPT",
  PAYMENT = "PAYMENT",
}

/**
 * Document type rendered in the "Loại chứng từ" column. Three values, not two:
 * a payment referencing a goods receipt is its own type, so the server-side
 * filter matches exactly what the column shows.
 */
export enum CashVoucherDocumentKind {
  CASH_RECEIPT = "CASH_RECEIPT",
  CASH_PAYMENT = "CASH_PAYMENT",
  GOODS_RECEIPT_PAYMENT = "GOODS_RECEIPT_PAYMENT",
}

/** One row of `POST /v2/cash-vouchers/search`. */
export interface CashVoucherRow {
  documentKind: CashVoucherDocumentKind;
  kind: ReceiptPaymentKind;
  id: string;
  createdAt: string;
  voucherDate: string;
  documentNumber: string | null;
  status: CashVoucherStatus;
  totalAmount: number;
  cashAccountId: string;
  referenceType: CashReceiptReferenceType | CashPaymentReferenceType | null;
  counterparty: string;
  reason: string | null;
}

/** Merged list row for Thu/chi screen. */
export interface ReceiptPaymentListItem {
  kind: ReceiptPaymentKind;
  id: string;
  /** Creation timestamp — the grid's date column and its sort key. */
  createdAt: string;
  voucherDate: string;
  documentNumber: string;
  status: CashVoucherStatus;
  totalAmount: number;
  counterparty: string;
  reason: string;
  referenceType?: CashReceiptReferenceType | CashPaymentReferenceType;
  isGoodsReceiptPayment: boolean;
  isAutoVoucher: boolean;
  receipt?: CashReceipt;
  payment?: CashPayment;
}

export interface CreateCashReceiptBody {
  documentNumber?: string;
  voucherDate: string;
  purpose?: CashReceiptPurpose;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payerName?: string;
  reason?: string;
  staffId?: string;
  cashAccountId: string;
  /** Optional contra override; normally resolved server-side from the purpose. */
  contraAccountId?: string;
  totalAmount: number;
  attachmentIds?: string[];
  lines: Array<{
    id?: string;
    description: string;
    categoryId?: string;
    amount: number;
    referenceNote?: string;
  }>;
}

export interface DebtCollectionAllocation {
  invoiceDebtId: string;
  amount: number;
}

export interface CreateDebtCollectionBody {
  voucherDate: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payerName?: string;
  reason?: string;
  staffId?: string;
  cashAccountId?: string;
  allocations: DebtCollectionAllocation[];
}

export interface DebtCollectionResult {
  sagaId: string;
  receiptId: string;
  documentNumber: string;
  totalAmount: number;
  status: "PENDING" | "COMPLETED" | "COMPENSATED" | "FAILED";
  allocations: Array<{
    invoiceDebtId: string;
    amount: number;
    debtPaymentId?: string;
    settled: boolean;
  }>;
}

export interface CreateCashPaymentBody {
  documentNumber?: string;
  voucherDate: string;
  purpose?: CashPaymentPurpose;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payeeName?: string;
  reason?: string;
  staffId?: string;
  cashAccountId: string;
  /** Optional contra override; normally resolved server-side from the purpose. */
  contraAccountId?: string;
  totalAmount: number;
  attachmentIds?: string[];
  lines: Array<{
    id?: string;
    description: string;
    categoryId?: string;
    amount: number;
    referenceNote?: string;
  }>;
}

export interface SupplierDebtPaymentAllocation {
  supplierDebtId: string;
  amount: number;
}

export interface CreateSupplierDebtPaymentBody {
  voucherDate: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payeeName?: string;
  reason?: string;
  staffId?: string;
  cashAccountId?: string;
  allocations: SupplierDebtPaymentAllocation[];
}

export interface SupplierDebtPaymentResult {
  sagaId: string;
  paymentId: string;
  documentNumber: string;
  totalAmount: number;
  status: "PENDING" | "COMPLETED" | "COMPENSATED" | "FAILED";
  allocations: Array<{
    supplierDebtId: string;
    amount: number;
    debtPaymentId?: string;
    settled: boolean;
  }>;
}

export interface CreateCashCountBody {
  cashAccountId: string;
  countedAt: string;
  actualAmount: number;
  documentNumber?: string;
  purpose?: string;
  notes?: string;
  denominations?: CashCountDenomination[];
}

export interface CashReceiptListQuery {
  status?: CashVoucherStatus;
  purpose?: CashReceiptPurpose;
  cashAccountId?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: "POS_SALE" | "DEBT_COLLECTION" | "MANUAL";
  page?: number;
  pageSize?: number;
}

export interface CashPaymentListQuery {
  status?: CashVoucherStatus;
  purpose?: CashPaymentPurpose;
  cashAccountId?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: "GOODS_RECEIPT" | "EXPENSE" | "MANUAL";
  page?: number;
  pageSize?: number;
}

export interface CashCountListQuery {
  status?: CashCountStatus;
  cashAccountId?: string;
  page?: number;
  pageSize?: number;
}

export interface CashLedgerQuery {
  /** Optional. When omitted, the backend uses the branch's single cash fund. */
  cashAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}
