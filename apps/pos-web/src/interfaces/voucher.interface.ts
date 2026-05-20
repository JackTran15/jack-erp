/**
 * Data contracts for `VoucherDialog` ("Voucher" modal).
 *
 * All inputs are optional so the dialog can render in an empty state when
 * the host has nothing to feed (form still submits — the result simply
 * carries empty selections).
 */

export interface VoucherOption {
  id: string;
  /** Display label shown inside the dropdown — e.g. "VIP-2024 (-50.000đ)". */
  label: string;
  /** "Mệnh giá" — used for the metric column + total computation. */
  faceValue?: number;
}

export interface VoucherSelectableItem {
  id: string;
  /** "Tên hàng hóa". */
  name: string;
  /** "SL" — typically taken from the cart line. */
  qty: number;
  /** "Đơn giá". */
  unitPrice: number;
  /** "Thành tiền" — when omitted, computed as qty × unitPrice. */
  lineTotal?: number;
}

export interface VoucherSelectableGroup {
  id: string;
  /** "Nhóm hàng hóa" / display name. */
  name: string;
  /** Parent id for nested rendering — top-level groups omit this. */
  parentId?: string;
}

export interface VoucherDialogData {
  voucherOptions?: VoucherOption[];
  items?: VoucherSelectableItem[];
  groups?: VoucherSelectableGroup[];
}
