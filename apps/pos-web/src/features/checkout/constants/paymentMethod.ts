import { PaymentMethodOption } from "../components/types";

export enum PaymentMethodEnum {
  CASH = "CASH",
  CARD = "CARD",
  TRANSFER = "TRANSFER",
}

export type PaymentMethod = PaymentMethodEnum;

export const PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  { value: PaymentMethodEnum.CASH, label: "Tiền mặt" },
  { value: PaymentMethodEnum.CARD, label: "Thẻ" },
  { value: PaymentMethodEnum.TRANSFER, label: "Chuyển khoản" },
];
