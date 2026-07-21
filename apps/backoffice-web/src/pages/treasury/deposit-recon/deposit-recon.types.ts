import type {
  DepositMovementSource,
  DepositMovementType,
  ReconStatus,
} from "@erp/shared-interfaces";

/**
 * Hand-rolled mirror of the deposit-recon backend DTOs/entities (`@erp/api-client`
 * generated schema types aren't wired into the `erpApi` wrapper — see
 * `bank-vouchers.types.ts` for the established pattern this follows).
 */

export enum DepositReconBatchStatus {
  RECONCILED = "RECONCILED",
  DISCREPANCY = "DISCREPANCY",
}

/**
 * One row of `GET /deposit-recon` — a raw `DepositMovementEntity` (money as
 * string, per NFR-06 numeric(18,2) serialization). No `depositAccount`
 * relation is joined server-side, so the account name must be resolved
 * client-side from `useDepositAccounts()`.
 */
export interface DepositReconMovementRow {
  id: string;
  organizationId: string;
  branchId: string;
  depositAccountId: string;
  toAccountId?: string | null;
  type: DepositMovementType;
  amount: string;
  feeAmount: string;
  netAmount: string;
  docDate: string;
  valueDate?: string | null;
  reconStatus: ReconStatus;
  reconBatchId?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: string | null;
  source: DepositMovementSource;
  sourceRefId?: string | null;
  sourceRefLineId?: string | null;
  documentNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Row returned by `POST /v2/deposit-recon/search`. Unlike the v1 row, the
 * deposit account and the reconciling user are resolved server-side and inlined,
 * and the money columns arrive as numbers rather than numeric-as-string.
 */
export interface DepositReconSearchRow {
  id: string;
  documentNumber?: string | null;
  type: DepositMovementType;
  depositAccountId: string;
  depositAccountName: string;
  depositAccountNo: string;
  docDate: string;
  valueDate?: string | null;
  amount: number;
  feeAmount: number;
  netAmount: number;
  reconStatus: ReconStatus;
  reconciledBy?: string | null;
  reconciledByName: string;
  reconciledAt?: string | null;
  createdAt: string;
  /** Which flow produced the movement — POS_INVOICE rows have no voucher. */
  source: DepositMovementSource;
  /** Meaning depends on `source`; the invoice id when source is POS_INVOICE. */
  sourceRefId?: string | null;
  bankPaymentId?: string | null;
  bankReceiptId?: string | null;
}

export interface ListReconQuery {
  depositAccountId?: string;
  reconStatus?: ReconStatus;
  dateFrom?: string;
  dateTo?: string;
  docNumber?: string;
  page?: number;
  pageSize?: number;
}

export interface ListReconResponse {
  data: DepositReconMovementRow[];
  total: number;
  rowCount: number;
  totalAmount: number;
  hasStaleUnreconciled: boolean;
  page: number;
  pageSize: number;
}

export interface DepositReconBatch {
  id: string;
  organizationId: string;
  branchId: string;
  depositAccountId: string;
  batchNumber?: string | null;
  stmtFromDate: string;
  stmtToDate: string;
  stmtTotalAmount: string;
  systemTotalAmount: string;
  diffAmount: string;
  status: DepositReconBatchStatus;
  note?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One batch = one deposit account: a bank statement belongs to a single bank. */
export interface ReconcileGroupBody {
  depositAccountId: string;
  movementIds: string[];
  stmtTotalAmount: number;
  /** Required when this group's statement total does not match (BR-REC-02). */
  note?: string;
}

export interface ReconcileBody {
  groups: ReconcileGroupBody[];
  stmtFromDate: string;
  stmtToDate: string;
}

export interface ReconcileGroupResult {
  batch: DepositReconBatch;
  systemTotalAmount: number;
  diffAmount: number;
  status: DepositReconBatchStatus;
  /** DRAFT bank-fee-adjustment proposal id when the batch is a discrepancy (BR-REC-03). */
  proposalId?: string;
}

export interface ReconcileResponse {
  /** Same order as the submitted `groups`. */
  results: ReconcileGroupResult[];
}

export interface UnreconcileBody {
  movementIds?: string[];
  batchId?: string;
  reason: string;
}

export interface UnreconcileResponse {
  updated: number;
}
