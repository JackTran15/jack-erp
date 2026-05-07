export enum PromotionStatusEnum {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  EXPIRED = "EXPIRED",
  SCHEDULED = "SCHEDULED",
}

export type PromotionStatus = PromotionStatusEnum;

export enum PromotionStatusToneEnum {
  SUCCESS = "success",
  WARNING = "warning",
  MUTED = "muted",
  INFO = "info",
}

export type PromotionStatusTone = PromotionStatusToneEnum;

export enum PromotionKindEnum {
  AMOUNT_OFF = "AMOUNT_OFF",
  PERCENT_OFF = "PERCENT_OFF",
  GIFT = "GIFT",
  VOUCHER = "VOUCHER",
  LOYALTY = "LOYALTY",
  CUSTOM = "CUSTOM",
}

export type PromotionKind = PromotionKindEnum;
