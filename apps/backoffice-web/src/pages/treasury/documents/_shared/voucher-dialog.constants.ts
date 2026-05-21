export const DEFAULT_VOUCHER_EMPLOYEE_CODE = "0000";
export const DEFAULT_VOUCHER_EMPLOYEE_NAME = "Phan Thanh Hà";

export enum PaymentVoucherPurposeGroupEnum {
  OTHER = "other",
}

export enum PaymentVoucherPurposeDetailEnum {
  OTHER_EXPENSE = "other_expense",
}

export const PAYMENT_PURPOSE_GROUP_OPTIONS = [
  { value: PaymentVoucherPurposeGroupEnum.OTHER, label: "Khác" },
] as const;

export const PAYMENT_PURPOSE_DETAIL_OPTIONS: Record<
  PaymentVoucherPurposeGroupEnum,
  readonly { value: PaymentVoucherPurposeDetailEnum; label: string }[]
> = {
  [PaymentVoucherPurposeGroupEnum.OTHER]: [
    { value: PaymentVoucherPurposeDetailEnum.OTHER_EXPENSE, label: "Chi khác" },
  ],
};

export interface VoucherFormLine {
  description: string;
  amount: number;
  category: string;
}

export function emptyFormLine(): VoucherFormLine {
  return { description: "", amount: 0, category: "" };
}
