import type {
  PromotionItem,
  PromotionKind,
  PromotionStatusInfo,
  PromotionStatusTone,
} from "./types";
import {
  PromotionKindEnum,
  PromotionStatusEnum,
  PromotionStatusToneEnum,
} from "../../../constants/promotion";

const KIND_LABELS: Record<PromotionKind, string> = {
  [PromotionKindEnum.AMOUNT_OFF]: "Giảm tiền",
  [PromotionKindEnum.PERCENT_OFF]: "Giảm %",
  [PromotionKindEnum.GIFT]: "Tặng quà",
  [PromotionKindEnum.VOUCHER]: "Voucher",
  [PromotionKindEnum.LOYALTY]: "Tích / dùng điểm",
  [PromotionKindEnum.CUSTOM]: "Khác",
};

const STATUS_TONE_DEFAULT: Record<
  PromotionStatusInfo["value"],
  PromotionStatusTone
> = {
  [PromotionStatusEnum.ACTIVE]: PromotionStatusToneEnum.SUCCESS,
  [PromotionStatusEnum.SCHEDULED]: PromotionStatusToneEnum.INFO,
  [PromotionStatusEnum.PAUSED]: PromotionStatusToneEnum.WARNING,
  [PromotionStatusEnum.EXPIRED]: PromotionStatusToneEnum.MUTED,
};

const STATUS_LABEL_DEFAULT: Record<PromotionStatusInfo["value"], string> = {
  [PromotionStatusEnum.ACTIVE]: "Đang áp dụng",
  [PromotionStatusEnum.SCHEDULED]: "Sắp diễn ra",
  [PromotionStatusEnum.PAUSED]: "Tạm dừng",
  [PromotionStatusEnum.EXPIRED]: "Đã kết thúc",
};

export const TONE_CLASS: Record<PromotionStatusTone, string> = {
  [PromotionStatusToneEnum.SUCCESS]: "bg-emerald-50 text-emerald-700",
  [PromotionStatusToneEnum.WARNING]: "bg-amber-50 text-amber-700",
  [PromotionStatusToneEnum.MUTED]: "bg-gray-100 text-gray-600",
  [PromotionStatusToneEnum.INFO]: "bg-indigo-50 text-indigo-700",
};

export function kindLabel(item: PromotionItem): string {
  return item.kindLabel ?? KIND_LABELS[item.kind] ?? "—";
}

export function resolvePromotionStatus(promotion: PromotionItem): {
  tone: PromotionStatusTone;
  label: string;
  hasStatus: boolean;
} {
  const status = promotion.status;
  if (!status) {
    return { tone: PromotionStatusToneEnum.MUTED, label: "—", hasStatus: false };
  }
  return {
    tone: status.tone ?? STATUS_TONE_DEFAULT[status.value],
    label: status.label ?? STATUS_LABEL_DEFAULT[status.value],
    hasStatus: true,
  };
}
