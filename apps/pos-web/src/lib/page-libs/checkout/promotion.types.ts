import type {
  PromotionKind,
  PromotionStatus,
  PromotionStatusTone,
} from "@erp/pos/constants/checkout.constant";

export {
  PromotionKindEnum,
  PromotionStatusEnum,
  PromotionStatusToneEnum,
  type PromotionKind,
  type PromotionStatus,
  type PromotionStatusTone,
} from "@erp/pos/constants/checkout.constant";

/**
 * Data contracts for `PromotionSelectionModal`.
 *
 * Loose by design — the modal renders an empty state when no promotions are
 * provided, so callers can wire real backend data later without changing the
 * dialog API.
 */

export interface PromotionStatusInfo {
  /** Machine-readable status (drives default tone if `tone` is omitted). */
  value: PromotionStatus;
  /** Vietnamese label shown in the status pill (defaults from `value`). */
  label?: string;
  /** Optional override for the pill colour. */
  tone?: PromotionStatusTone;
}

export interface PromotionItem {
  id: string;
  /** "Tên chương trình". */
  name: string;
  /** "Hình thức" — used for Vietnamese label lookup. */
  kind: PromotionKind;
  /** Override label cho cột "Hình thức" (bắt buộc khi kind = CUSTOM). */
  kindLabel?: string;
  /** "Mô tả". */
  description?: string;
  /** "Trạng thái" — when omitted, the column renders an em-dash. */
  status?: PromotionStatusInfo;
  /** Disable selection (greyed out row). */
  disabled?: boolean;
}
