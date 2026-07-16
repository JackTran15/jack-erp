/**
 * Deposit Fund (Quỹ tiền gửi) shared types — EPIC-15072026.
 *
 * Enum values match the Postgres enum types created in the DepositFundFoundation
 * migration (TKT-DF-01). Money fields are `string` because TypeORM serializes
 * `numeric(18,2)` to string (NFR-06: never float).
 */

export enum DepositAccountType {
  BANK_ACCOUNT = 'BANK_ACCOUNT',
  EWALLET = 'EWALLET',
  POS_MERCHANT = 'POS_MERCHANT',
}

export enum DepositAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum DepositMovementType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum DepositMovementSource {
  POS_INVOICE = 'POS_INVOICE',
  MANUAL = 'MANUAL',
  TRANSFER = 'TRANSFER',
  SYSTEM = 'SYSTEM',
}

/**
 * Derived return value only — NOT persisted and has no Postgres enum. A non-cash
 * payment line routes to the deposit fund iff its resolved COA matches an ACTIVE
 * deposit_accounts.account_id in the same org+branch (see TKT-DF-04).
 */
export enum TargetFund {
  DEPOSIT = 'DEPOSIT',
  OTHER = 'OTHER',
}

/** Used by deposit_payment_policy.fee_bearer. */
export enum FeeBearer {
  MERCHANT = 'MERCHANT',
  CUSTOMER = 'CUSTOMER',
}

export enum ReconStatus {
  CHUA = 'CHUA',
  DA = 'DA',
  LECH = 'LECH',
}

export enum DepositTransferStatus {
  DANG_CHUYEN = 'DANG_CHUYEN',
  HOAN_TAT = 'HOAN_TAT',
  /** GĐ4 (TKT-DFB-01) only — never assigned to deposit_movements.transfer_status. */
  DA_HUY = 'DA_HUY',
}

export interface DepositAccount {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  code: string;
  accountNo: string;
  accountName: string;
  bankId: string;
  bankBranch?: string | null;
  type: DepositAccountType;
  mid?: string | null;
  tid?: string | null;
  accountId: string; // COA 112x
  openingBalance: string;
  openingDate: string;
  balance: string;
  allowNegative: boolean;
  isDefault: boolean;
  status: DepositAccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DepositPaymentPolicy {
  id: string;
  organizationId: string;
  branchId?: string | null; // null = org-wide default (mirrors payment_accounts scoping)
  paymentMethod: string;
  cardType?: string | null; // null in GĐ1 (invoice_payments has no cardType column yet)
  depositAccountId?: string | null; // fund override, only when the COA-join is ambiguous
  feeRate: string;
  feeBearer?: FeeBearer | null;
  settlementDays: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

export interface ResolveDepositTargetResult {
  fund: TargetFund; // DEPOSIT | OTHER (derived from COA)
  depositAccountId?: string | null;
  feeRate: string;
  feeBearer?: FeeBearer | null;
  settlementDays: number;
}

export interface DepositLedgerRow {
  id: string;
  docDate: string;
  documentNumber?: string | null;
  receiptNo?: string | null; // NTTK
  paymentNo?: string | null; // UNC
  depositAccountNo: string;
  description?: string | null;
  amountIn: string;
  amountOut: string;
  runningBalance: string;
  counterpartyName?: string | null;
  staffName?: string | null;
  reconStatus: ReconStatus;
  /** Settlement date (R2); null = cleared immediately (settlement_days=0). */
  valueDate?: string | null;
  /** true when valueDate is null or <= today — money has actually landed. */
  isCleared: boolean;
}

/** GĐ4 (TKT-DFB-01) — header linking the two legs of an inter-branch transfer. */
export interface DepositTransfer {
  id: string;
  organizationId: string;
  fromBranchId: string;
  toBranchId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  status: DepositTransferStatus;
  fromPaymentId: string;
  toReceiptId?: string | null;
  transferPairId: string;
  initiatedBy: string;
  initiatedAt: string;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DepositLedgerResponse {
  openingBalance: string;
  rows: DepositLedgerRow[];
  totalIn: string;
  totalOut: string;
  closingBalance: string;
  page: number;
  pageSize: number;
  total: number; // EXCLUDES the opening-balance row (ref.md §6.10)
  /** R2 — book (doc_date, = closingBalance) vs available (only cleared value_date) balance. */
  bookBalance: string;
  availableBalance: string;
  pendingClearingAmount: string;
}
