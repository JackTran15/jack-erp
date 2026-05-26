import { CashCountStatusEnum } from "./cash-count.types";

/** Giá trị VNĐ — 500k đến 1k. */
export const VND_DENOMINATIONS = [
  500_000,
  200_000,
  100_000,
  50_000,
  20_000,
  10_000,
  5_000,
  2_000,
  1_000,
] as const;

export const CASH_COUNT_FILTER_KEYS = [
  "countDate",
  "documentNumber",
  "inventoryUntilDate",
  "purpose",
  "statusLabel",
] as const;

export type CashCountFilterKey = (typeof CASH_COUNT_FILTER_KEYS)[number];

export const CASH_COUNT_STATUS_LABEL: Record<CashCountStatusEnum, string> = {
  [CashCountStatusEnum.UNPROCESSED]: "Chưa xử lý",
  [CashCountStatusEnum.PROCESSED]: "Đã xử lý",
};

export const CASH_COUNT_STATUS_FILTER_OPTIONS = [
  {
    value: CASH_COUNT_STATUS_LABEL[CashCountStatusEnum.UNPROCESSED],
    label: CASH_COUNT_STATUS_LABEL[CashCountStatusEnum.UNPROCESSED],
  },
  {
    value: CASH_COUNT_STATUS_LABEL[CashCountStatusEnum.PROCESSED],
    label: CASH_COUNT_STATUS_LABEL[CashCountStatusEnum.PROCESSED],
  },
];
