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

export interface ReconcileBody {
  depositAccountId: string;
  movementIds: string[];
  stmtTotalAmount: number;
  stmtFromDate: string;
  stmtToDate: string;
  /** Required when the statement total does not match the system total (BR-REC-02). */
  note?: string;
}

export interface ReconcileResponse {
  batch: DepositReconBatch;
  systemTotalAmount: number;
  diffAmount: number;
  status: DepositReconBatchStatus;
  /** DRAFT bank-fee-adjustment proposal id when the batch is a discrepancy (BR-REC-03). */
  proposalId?: string;
}

export interface UnreconcileBody {
  movementIds?: string[];
  batchId?: string;
  reason: string;
}

export interface UnreconcileResponse {
  updated: number;
}
