/**
 * Data contracts for `PromotionSelectionModal`.
 *
 * Loose by design — the modal renders an empty state when no promotions are
 * provided, so callers can wire real backend data later without changing the
 * dialog API.
 */

export type PromotionStatus = "ACTIVE" | "PAUSED" | "EXPIRED" | "SCHEDULED";

/** Display tone for the status pill — derived from `PromotionStatus`. */
export type PromotionStatusTone = "success" | "warning" | "muted" | "info";

export interface PromotionStatusInfo {
  /** Machine-readable status (drives default tone if `tone` is omitted). */
  value: PromotionStatus;
  /** Vietnamese label shown in the status pill (defaults from `value`). */
  label?: string;
  /** Optional override for the pill colour. */
  tone?: PromotionStatusTone;
}

export type PromotionKind =
  /** "Hình thức": giảm theo số tiền cố định. */
  | "AMOUNT_OFF"
  /** "Hình thức": giảm theo phần trăm. */
  | "PERCENT_OFF"
  /** "Hình thức": tặng quà / item kèm theo. */
  | "GIFT"
  /** "Hình thức": voucher / mã ưu đãi. */
  | "VOUCHER"
  /** "Hình thức": tích / dùng điểm. */
  | "LOYALTY"
  /** Fallback: tự do, hiển thị label do caller cung cấp. */
  | "CUSTOM";

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
