import type { CustomerGenderEnum } from "@erp/pos/types/customer.type";

/**
 * Extended customer record accepted by the create/edit dialog. The fields
 * beyond `id`, `name`, `phone`, `email` are display-only — the backend
 * currently only persists the narrow `CreateCustomerBody`. They live here so
 * callers that already have richer data can pre-fill the form.
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
