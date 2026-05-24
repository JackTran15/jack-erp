import type { TreasuryVoucherDialogModeEnum } from "../../documents";
import type { LedgerCashRow } from "../../ledger-cash/ledger-cash.types";

export enum ReceiptCashVoucherDialogKindEnum {
  RECEIPT = "receipt",
  PAYMENT = "payment",
}

export interface ReceiptCashVoucherDialogState {
  kind: ReceiptCashVoucherDialogKindEnum;
  mode: TreasuryVoucherDialogModeEnum;
}

/** List row wraps ledger voucher row with derived display fields. */
export interface ReceiptCashListRow extends LedgerCashRow {
  voucherNo: string;
  totalAmount: number;
  documentTypeLabel: string;
}
