import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
} from "../../cash-vouchers.types";

export const DEFAULT_VOUCHER_EMPLOYEE_CODE = "0000";
export const DEFAULT_VOUCHER_EMPLOYEE_NAME = "Phan Thanh Hà";

export const PAYMENT_PURPOSE_OPTIONS: readonly {
  value: CashPaymentPurpose;
  label: string;
}[] = [
  { value: CashPaymentPurpose.OTHER, label: "Chi khác" },
  { value: CashPaymentPurpose.SUPPLIER_PAYMENT, label: "Trả tiền nhà cung cấp" },
  { value: CashPaymentPurpose.PURCHASE, label: "Chi mua hàng" },
  { value: CashPaymentPurpose.EXPENSE, label: "Chi phí" },
  { value: CashPaymentPurpose.SALARY, label: "Chi lương" },
  { value: CashPaymentPurpose.REFUND, label: "Hoàn tiền" },
  {
    value: CashPaymentPurpose.DEPOSIT_TRANSFER,
    label: "Chuyển tiền mặt thành tiền gửi",
  },
  {
    value: CashPaymentPurpose.INTER_BRANCH_OUT,
    label: "Chuyển tiền đến cửa hàng khác",
  },
] as const;

export const PAYMENT_PURPOSE_LABEL: Record<CashPaymentPurpose, string> =
  Object.fromEntries(
    PAYMENT_PURPOSE_OPTIONS.map((o) => [o.value, o.label]),
  ) as Record<CashPaymentPurpose, string>;

export enum PaymentPurposeRadio {
  OTHER_GROUP = "OTHER_GROUP",
  DEBT_GROUP = "DEBT_GROUP",
}

export const PAYMENT_VOUCHER_PURPOSE_RADIO_OPTIONS = [
  { value: PaymentPurposeRadio.OTHER_GROUP, label: "Khác" },
  { value: PaymentPurposeRadio.DEBT_GROUP, label: "Trả nợ" },
];

export enum PaymentOtherSubOption {
  OTHER = "OTHER",
  CASH_TO_DEPOSIT = "CASH_TO_DEPOSIT",
  BRANCH_TRANSFER = "BRANCH_TRANSFER",
}

export const PAYMENT_OTHER_SUB_OPTIONS: readonly {
  value: PaymentOtherSubOption;
  label: string;
}[] = [
  { value: PaymentOtherSubOption.OTHER, label: "Chi khác" },
  { value: PaymentOtherSubOption.CASH_TO_DEPOSIT, label: "Chuyển tiền mặt thành tiền gửi" },
  { value: PaymentOtherSubOption.BRANCH_TRANSFER, label: "Chuyển tiền đến cửa hàng khác" },
];

export function isTransferSubOption(sub: PaymentOtherSubOption): boolean {
  return (
    sub === PaymentOtherSubOption.CASH_TO_DEPOSIT ||
    sub === PaymentOtherSubOption.BRANCH_TRANSFER
  );
}

export function subOptionToApiPurpose(
  sub: PaymentOtherSubOption,
): CashPaymentPurpose {
  switch (sub) {
    case PaymentOtherSubOption.CASH_TO_DEPOSIT:
      return CashPaymentPurpose.DEPOSIT_TRANSFER;
    case PaymentOtherSubOption.BRANCH_TRANSFER:
      return CashPaymentPurpose.INTER_BRANCH_OUT;
    default:
      return CashPaymentPurpose.OTHER;
  }
}

/**
 * Inverse of {@link subOptionToApiPurpose}, for rehydrating a saved voucher.
 * `referenceType` is the fallback for fund swaps posted before
 * `DEPOSIT_TRANSFER` existed — those rows carry purpose OTHER.
 */
export function apiPurposeToSubOption(
  purpose: CashPaymentPurpose,
  referenceType?: CashPaymentReferenceType,
): PaymentOtherSubOption {
  switch (purpose) {
    case CashPaymentPurpose.DEPOSIT_TRANSFER:
      return PaymentOtherSubOption.CASH_TO_DEPOSIT;
    case CashPaymentPurpose.INTER_BRANCH_OUT:
      return PaymentOtherSubOption.BRANCH_TRANSFER;
    default:
      break;
  }
  if (referenceType === CashPaymentReferenceType.FUND_SWAP) {
    return PaymentOtherSubOption.CASH_TO_DEPOSIT;
  }
  if (referenceType === CashPaymentReferenceType.TRANSFER) {
    return PaymentOtherSubOption.BRANCH_TRANSFER;
  }
  return PaymentOtherSubOption.OTHER;
}

/** Auto-filled "Lý do chi" + detail line for each transfer sub-mode. */
export const TRANSFER_SUB_OPTION_REASON: Record<PaymentOtherSubOption, string> = {
  [PaymentOtherSubOption.OTHER]: "",
  [PaymentOtherSubOption.CASH_TO_DEPOSIT]: "Chi tiền mặt nhập quỹ tiền gửi",
  [PaymentOtherSubOption.BRANCH_TRANSFER]: "Chi chuyển tiền sang cửa hàng khác",
};

// ── Deposit ("Phiếu chi tiền gửi") top-level purpose split — separate from the
// CASH constants above; the "Hình thức chi" sub-list itself reuses
// `BankPaymentPurpose` directly (already has CASH_TRANSFER/INTER_BRANCH_OUT),
// no parallel sub-option enum needed. ────────────────────────────────────────

export enum DepositPaymentPurposeRadio {
  OTHER_GROUP = "OTHER_GROUP",
  DEBT_GROUP = "DEBT_GROUP",
}

export const DEPOSIT_PAYMENT_PURPOSE_RADIO_OPTIONS = [
  { value: DepositPaymentPurposeRadio.OTHER_GROUP, label: "Khác" },
  { value: DepositPaymentPurposeRadio.DEBT_GROUP, label: "Trả nợ" },
];

export interface VoucherFormLine {
  description: string;
  amount: number;
  category: string;
  categoryId?: string;
}

export function emptyFormLine(): VoucherFormLine {
  return { description: "", amount: 0, category: "", categoryId: undefined };
}
