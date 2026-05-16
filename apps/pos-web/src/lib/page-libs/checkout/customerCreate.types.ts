import type { RefObject } from "react";
import type { CustomerGenderEnum, CustomerRow } from "@erp/pos/lib/common/customerApi";

export type CustomerDialogMode = "create" | "edit";

/**
 * Extended customer record accepted by the dialog. The fields beyond `id`,
 * `name`, `phone`, `email` are display-only — the backend currently only
 * persists the narrow `CreateCustomerBody`. They live here so callers that
 * already have richer data can pre-fill the form.
 */
export interface CustomerFormValues {
  id?: string;
  /** Auto-generated public code (e.g. "KH000018"). Read-only in the form. */
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  cccd?: string | null;
  /** ISO date or "yyyy-MM-dd" string; rendered with `<input type="date">`. */
  birthday?: string | null;
  gender?: CustomerGenderEnum | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  /** "Số nhà, tên đường" — the freeform first line of the address. */
  addressLine?: string | null;
  cardCode?: string | null;
  cardTier?: string | null;
  customerGroup?: string | null;
  accountManager?: string | null;
  note?: string | null;
  companyName?: string | null;
  taxCode?: string | null;
}

export interface CustomerSelectOption {
  value: string;
  label: string;
}

export interface CustomerCreateDialogProps {
  open: boolean;
  onClose: () => void;

  /** Defaults to `"create"` so legacy callers keep working unchanged. */
  mode?: CustomerDialogMode;
  /**
   * Initial seed. In `edit` mode, `customer.id` drives the internal
   * `useCustomer(id)` fetch that populates the rest of the form, so the
   * caller only needs to pass what it already has (typically `id` + `name` +
   * `phone` + `email` from the search row). In `create` mode this is used
   * to override name/phone/email defaults if desired.
   */
  customer?: CustomerFormValues;
  /** Used in `create` mode to seed name OR phone (depending on shape). */
  defaultQuery?: string;
  /** Auto-generated customer code shown read-only when creating. */
  defaultCustomerCode?: string;

  // Lookup data — caller supplies whatever it has; sensible fallbacks below.
  // Customer groups are fetched internally via `useCustomerGroups()` and so
  // are intentionally NOT exposed as a prop here.
  provinces?: CustomerSelectOption[];
  districts?: CustomerSelectOption[];
  wards?: CustomerSelectOption[];
  cardTiers?: CustomerSelectOption[];
  accountManagers?: CustomerSelectOption[];

  /** Called after a successful create or update. Preferred for new code. */
  onSubmitted?: (customer: CustomerRow, mode: CustomerDialogMode) => void;
  /**
   * LEGACY alias for `onSubmitted`. Fires for **both** create and update so
   * existing call sites (e.g. `CheckoutPage.tsx`) keep working unchanged.
   */
  onCreated?: (customer: CustomerRow) => void;

  /** "+ Nhóm khách hàng" sub-flow trigger. Omit to hide the button. */
  onAddCustomerGroup?: () => void;

  /**
   * Ref tới element nhận focus sau khi dialog đóng — forwarded to
   * `PosDialog.returnFocusTo`. Dùng cho hotkey flow (cancel/ESC → quay về ô
   * search KH, tạo thành công → focus ô nhập tiền).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}
