import type { TreasuryVoucherDialogModeEnum } from "../../documents";
import type {
  BankPayment,
  BankPaymentReferenceType,
  BankReceipt,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from "../../bank-vouchers.types";

export enum ReceiptDepositKind {
  RECEIPT = "RECEIPT",
  PAYMENT = "PAYMENT",
}

/** Merged list row for the "Thu/chi tiền gửi" screen. */
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
  referenceType?: BankReceiptReferenceType | BankPaymentReferenceType;
  isReversed: boolean;
  receipt?: BankReceipt;
  payment?: BankPayment;
}

export enum ReceiptDepositVoucherDialogKindEnum {
  RECEIPT = "receipt",
  PAYMENT = "payment",
}

export interface ReceiptDepositVoucherDialogState {
  kind: ReceiptDepositVoucherDialogKindEnum;
  mode: TreasuryVoucherDialogModeEnum;
}
