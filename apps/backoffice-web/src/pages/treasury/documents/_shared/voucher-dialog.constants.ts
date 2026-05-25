import { CashPaymentPurpose } from "../../cash-vouchers.types";

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
] as const;

export const PAYMENT_PURPOSE_LABEL: Record<CashPaymentPurpose, string> =
  Object.fromEntries(
    PAYMENT_PURPOSE_OPTIONS.map((o) => [o.value, o.label]),
  ) as Record<CashPaymentPurpose, string>;

export const PAYMENT_VOUCHER_PURPOSE_RADIO_OPTIONS = [
  { value: "OTHER_GROUP" as const, label: "Khác" },
  { value: "DEBT_GROUP" as const, label: "Trả nợ" },
] as const;

export type PaymentPurposeRadio = "OTHER_GROUP" | "DEBT_GROUP";

export const PAYMENT_OTHER_SUB_OPTIONS: readonly {
  value: CashPaymentPurpose;
  label: string;
}[] = PAYMENT_PURPOSE_OPTIONS.filter(
  (o) => o.value !== CashPaymentPurpose.SUPPLIER_PAYMENT,
);

export interface VoucherFormLine {
  description: string;
  amount: number;
  category: string;
}

export function emptyFormLine(): VoucherFormLine {
  return { description: "", amount: 0, category: "" };
}
