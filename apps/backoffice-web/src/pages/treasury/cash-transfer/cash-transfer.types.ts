import type { DepositTransferStatus } from "@erp/shared-interfaces";
import type {
  CashTransferFundKind,
  CashVoucherPartnerType,
} from "../cash-vouchers.types";

/**
 * Hand-rolled mirror of the cash-transfer backend DTOs, following the same
 * pattern as `deposit-transfer.types.ts` (the `@erp/api-client` generated schema
 * types aren't wired into the `erpApi` wrapper). The lifecycle status reuses
 * `DepositTransferStatus` because the backend reuses the same enum.
 */

/** OUT = the current branch is the source (fromBranchId); IN = destination (toBranchId). */
export enum CashTransferDirection {
  OUT = "OUT",
  IN = "IN",
}

export interface CashTransfer {
  id: string;
  organizationId: string;
  fromBranchId: string;
  toBranchId: string;
  fromCashAccountId: string;
  toFundKind: CashTransferFundKind;
  toCashAccountId?: string | null;
  toDepositAccountId?: string | null;
  amount: number;
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

export interface ListCashTransfersQuery {
  status?: DepositTransferStatus;
  direction?: CashTransferDirection;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ListCashTransfersResponse {
  data: CashTransfer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateCashTransferLine {
  description: string;
  amount: number;
  categoryId?: string;
}

export interface CreateCashTransferBody {
  toBranchId: string;
  toFundKind: CashTransferFundKind;
  /** Required when toFundKind is DEPOSIT. */
  toAccountId?: string;
  amount: number;
  fromCashAccountId?: string;
  docDate?: string;
  note?: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  /** "Người nhận" */
  payeeName?: string;
  address?: string;
  /** "Nhân viên chi" */
  paidBy?: string;
  lines?: CreateCashTransferLine[];
}

export interface ConfirmCashTransferBody {
  note?: string;
}

export interface CancelCashTransferBody {
  reason: string;
}
