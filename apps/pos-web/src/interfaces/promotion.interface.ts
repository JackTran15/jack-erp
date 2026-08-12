import type {
  PromotionKind,
  PromotionStatus,
  PromotionStatusTone,
} from "@erp/pos/constants/checkout.constant";
import type { SkippedProgramReason } from "@erp/shared-interfaces";

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
  /** Disable selection (greyed out row). `RESOURCE_TAKEN` rows are the one skipped-reason exception — see `reasonCode`. */
  disabled?: boolean;
  /** Đã tick/đang áp — hiện checkbox checked. Không đồng nghĩa `disabled`. */
  selected?: boolean;
  /** Lý do bị bỏ qua bằng tiếng Việt — chỉ có ở CTKM bị bỏ qua (không đồng nghĩa `disabled`; `RESOURCE_TAKEN` vẫn set `reason` nhưng `disabled=false`, xem T-04-03). */
  reason?: string;
  /**
   * Mã lý do gốc (máy đọc được) song song với `reason` (tiếng Việt, để hiện).
   * Chỉ `RESOURCE_TAKEN` mới cho phép tick (UOW-04/ADR-03) — dùng field này để
   * phân biệt thay vì so sánh chuỗi `reason` đã dịch.
   */
  reasonCode?: SkippedProgramReason;
  /** Tên chương trình đang thắng tài nguyên — chỉ set khi `reasonCode === 'RESOURCE_TAKEN'`, dùng cho hộp xác nhận hoán đổi (T-04-03). */
  takenByName?: string;
  /**
   * Thu ngân đã bỏ hẳn CTKM này (UOW-09/ADR-07) — `reasonCode === 'EXCLUDED_BY_CASHIER'`.
   * Khác `disabled` (không đủ điều kiện) — dòng `excluded` vẫn tick lại được,
   * không cần xác nhận (chỉ loại nó mới cần, xem T-09-03).
   */
  excluded?: boolean;
}
