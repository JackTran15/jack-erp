import type { TreasuryVoucherDialogModeEnum } from "../../documents";
import type { BankVoucherStatus } from "../../bank-vouchers.types";

export enum ReceiptDepositKind {
  RECEIPT = "RECEIPT",
  PAYMENT = "PAYMENT",
}

/** Raw row as returned by `POST /v2/deposit-vouchers/search`. */
export interface DepositVoucherRow {
  kind: ReceiptDepositKind;
  id: string;
  docDate: string;
  documentNumber: string | null;
  status: BankVoucherStatus;
  totalAmount: number;
  depositAccountId: string;
  depositAccountName: string;
  depositAccountNo: string;
  referenceType: string | null;
  counterparty: string;
  reason: string | null;
  createdAt: string;
}

/**
 * List row for the "Thu/chi tiền gửi" screen. The server now merges receipts and
 * payments into one ordered stream and inlines the deposit account, so nothing
 * is joined, filtered or sorted client-side any more.
 */
export interface ReceiptDepositListItem {
  kind: ReceiptDepositKind;
  id: string;
  docDate: string;
  documentNumber: string;
  status: BankVoucherStatus;
  totalAmount: number;
  counterparty: string;
  reason: string;
  depositAccountId: string;
  depositAccountName: string;
  depositAccountNo: string;
  referenceType?: string;
  isReversed: boolean;
}

export enum ReceiptDepositVoucherDialogKindEnum {
  RECEIPT = "receipt",
  PAYMENT = "payment",
}

export interface ReceiptDepositVoucherDialogState {
  kind: ReceiptDepositVoucherDialogKindEnum;
  mode: TreasuryVoucherDialogModeEnum;
}
