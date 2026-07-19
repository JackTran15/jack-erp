import type { CashVoucherPartnerType } from "./cash-vouchers.types";

export enum BankVoucherStatus {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  POSTED = "POSTED",
  REVERSED = "REVERSED",
}

export enum BankReceiptPurpose {
  OTHER = "OTHER",
  DEBT_COLLECTION = "DEBT_COLLECTION",
  OTHER_INCOME = "OTHER_INCOME",
  INTER_BRANCH_IN = "INTER_BRANCH_IN",
}

export enum BankReceiptReferenceType {
  INVOICE_DEBT = "INVOICE_DEBT",
  RECEIVABLE = "RECEIVABLE",
  TRANSFER = "TRANSFER",
  MANUAL = "MANUAL",
  REVERSAL = "REVERSAL",
}

export enum BankPaymentPurpose {
  SUPPLIER_PAYMENT = "SUPPLIER_PAYMENT",
  PURCHASE = "PURCHASE",
  EXPENSE = "EXPENSE",
  CASH_TRANSFER = "CASH_TRANSFER",
  INTER_BRANCH_OUT = "INTER_BRANCH_OUT",
  REFUND = "REFUND",
  BANK_FEE = "BANK_FEE",
  OTHER = "OTHER",
}

export enum BankPaymentReferenceType {
  GOODS_RECEIPT = "GOODS_RECEIPT",
  PAYABLE = "PAYABLE",
  INVOICE = "INVOICE",
  TRANSFER = "TRANSFER",
  EXPENSE = "EXPENSE",
  MANUAL = "MANUAL",
  REVERSAL = "REVERSAL",
}

export interface BankVoucherLine {
  id?: string;
  description: string;
  categoryId?: string;
  amount: number;
  referenceNote?: string;
}

export interface BankReceipt {
  id: string;
  organizationId: string;
  branchId: string;
  depositAccountId: string;
  documentNumber?: string;
  purpose: BankReceiptPurpose;
  status: BankVoucherStatus;
  docDate: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerNameSnapshot?: string;
  partnerAddressSnapshot?: string;
  payerName?: string;
  reason?: string;
  collectedBy?: string;
  reference?: string;
  affectRevenue: boolean;
  contraAccountId?: string;
  totalAmount: number;
  attachmentIds: string[];
  referenceType?: BankReceiptReferenceType;
  referenceId?: string;
  depositMovementId?: string;
  journalEntryId?: string;
  reversesVoucherId?: string;
  reversedByVoucherId?: string;
  reversalReason?: string;
  postedAt?: string;
  postedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lines: BankVoucherLine[];
}

export interface BankPayment {
  id: string;
  organizationId: string;
  branchId: string;
  depositAccountId: string;
  documentNumber?: string;
  purpose: BankPaymentPurpose;
  status: BankVoucherStatus;
  docDate: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerNameSnapshot?: string;
  partnerAddressSnapshot?: string;
  payeeName?: string;
  reason?: string;
  paidBy?: string;
  reference?: string;
  affectExpense: boolean;
  contraAccountId?: string;
  totalAmount: number;
  attachmentIds: string[];
  referenceType?: BankPaymentReferenceType;
  referenceId?: string;
  depositMovementId?: string;
  journalEntryId?: string;
  reversesVoucherId?: string;
  reversedByVoucherId?: string;
  reversalReason?: string;
  postedAt?: string;
  postedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lines: BankVoucherLine[];
}

export interface PaginatedList<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateBankReceiptBody {
  documentNumber?: string;
  depositAccountId: string;
  docDate: string;
  purpose?: BankReceiptPurpose;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payerName?: string;
  reason?: string;
  collectedBy?: string;
  reference?: string;
  affectRevenue?: boolean;
  contraAccountId?: string;
  totalAmount: number;
  attachmentIds?: string[];
  lines: BankVoucherLine[];
}

export type UpdateBankReceiptBody = Partial<CreateBankReceiptBody>;

export interface CreateBankPaymentBody {
  documentNumber?: string;
  depositAccountId: string;
  docDate: string;
  purpose?: BankPaymentPurpose;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payeeName?: string;
  reason?: string;
  paidBy?: string;
  reference?: string;
  affectExpense?: boolean;
  contraAccountId?: string;
  totalAmount: number;
  attachmentIds?: string[];
  lines: BankVoucherLine[];
}

export type UpdateBankPaymentBody = Partial<CreateBankPaymentBody>;

export interface BankReceiptListQuery {
  status?: BankVoucherStatus;
  purpose?: BankReceiptPurpose;
  depositAccountId?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: "DEBT_COLLECTION" | "TRANSFER" | "MANUAL";
  page?: number;
  pageSize?: number;
}

export interface BankPaymentListQuery {
  status?: BankVoucherStatus;
  purpose?: BankPaymentPurpose;
  depositAccountId?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: "GOODS_RECEIPT" | "EXPENSE" | "TRANSFER" | "MANUAL";
  page?: number;
  pageSize?: number;
}

// ── Supplier deposit payment saga (FR-06 — pay supplier debts from deposit/mixed funds) ──

export enum SupplierDepositPaymentFund {
  CASH = "CASH",
  DEPOSIT = "DEPOSIT",
}

export interface SupplierDepositPaymentLeg {
  fund: SupplierDepositPaymentFund;
  /** Required when fund = DEPOSIT. */
  depositAccountId?: string;
  /** Optional when fund = CASH — defaults to the branch's single fund. */
  cashAccountId?: string;
  amount: number;
}

export interface SupplierDepositPaymentAllocation {
  supplierDebtId: string;
  amount: number;
}

export interface CreateSupplierDepositPaymentBody {
  docDate: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payeeName?: string;
  reason?: string;
  legs: SupplierDepositPaymentLeg[];
  allocations: SupplierDepositPaymentAllocation[];
}

export interface SupplierDepositPaymentSagaResult {
  idempotencyKey: string;
  status: "PENDING" | "COMPLETED" | "COMPENSATED" | "FAILED";
  bankPaymentId?: string;
  cashPaymentId?: string;
  contraAccountId: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  totalAmount: number;
  error?: string;
  id: string;
}

// ── Fund swap (cash <-> deposit, FR-08) ──

export enum FundSwapDirection {
  DEPOSIT_TO_CASH = "DEPOSIT_TO_CASH",
  CASH_TO_DEPOSIT = "CASH_TO_DEPOSIT",
}

export interface CreateFundSwapBody {
  direction: FundSwapDirection;
  depositAccountId: string;
  /** Defaults to the branch's single cash fund when omitted. */
  cashAccountId?: string;
  amount: number;
  docDate: string;
  /** Withdrawal fee (BR-SWP-03) — only applies to DEPOSIT_TO_CASH. */
  feeAmount?: number;
  reason?: string;
  /** DEPOSIT_TO_CASH only — false skips auto-creating the matching cash receipt. */
  autoCreateReceipt?: boolean;
}
