/**
 * Data contracts for `DiscountPointDialog` ("Mã ưu đãi và điểm").
 *
 * All fields are optional so the dialog can render in a graceful "guest"
 * state when the host has nothing to provide yet — the gradient card
 * collapses to placeholder text, stats default to 0, and the helper line
 * shows "0 điểm = 0".
 */

export interface MemberCardData {
  /** Display name shown next to the avatar — e.g. "Anh Hà". */
  name?: string | null;
  /** "Mã thẻ thành viên" — e.g. "100000001". */
  cardNumber?: string | null;
  /** "Tổng chi tiêu" — green stat. */
  totalSpent?: number;
  /** "Điểm tích lũy" — amber stat. */
  loyaltyPoints?: number;
  /** Initial value for the "Sử dụng điểm" input. */
  pointsUsed?: number;
  /** 1 point = N currency units (default 1). Drives the helper line. */
  pointsRate?: number;
}

export interface DiscountPointData {
  /** Member info shown on the left panel. Omit for the empty/guest state. */
  member?: MemberCardData;
}
