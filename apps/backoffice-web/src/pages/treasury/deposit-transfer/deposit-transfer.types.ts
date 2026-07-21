import type { DepositTransfer } from "@erp/shared-interfaces";
import type { CashVoucherPartnerType } from "../cash-vouchers.types";

/**
 * Hand-rolled mirror of the GĐ4 deposit-transfer backend DTOs (`@erp/api-client`
 * generated schema types aren't wired into the `erpApi` wrapper — see
 * `bank-vouchers.types.ts` / `deposit-recon.types.ts` for the established
 * pattern this follows). `DepositTransfer` / `DepositTransferStatus` are
 * already exported from `@erp/shared-interfaces` (TKT-DFB-01/02).
 */

/** OUT = the current branch is the source (fromBranchId); IN = destination (toBranchId). */
export enum DepositTransferDirection {
  OUT = "OUT",
  IN = "IN",
}

export interface ListDepositTransfersQuery {
  status?: DepositTransfer["status"];
  direction?: DepositTransferDirection;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ListDepositTransfersResponse {
  data: DepositTransfer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDepositTransferBody {
  toBranchId: string;
  toAccountId: string;
  amount: number;
  note?: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  /** "Người nhận" */
  payeeName?: string;
  /** "Nhân viên chi" */
  paidBy?: string;
}

export interface ConfirmDepositTransferBody {
  note?: string;
}

export interface CancelDepositTransferBody {
  reason: string;
}
