import { CashVoucherPartnerType } from "../../cash-vouchers.types";

export enum PartnerLookupType {
  EMPLOYEE = "employee",
  CUSTOMER = "customer",
  SUPPLIER = "supplier",
  ALL = "all",
  /**
   * A party the user types by hand instead of picking from a catalogue.
   *
   * Deliberately absent from the backend's own `PartnerLookupType`: there is
   * nothing to search for, so `GET /cash-vouchers/partners` is never called with
   * it. It exists only to drive the form.
   */
  OTHER = "other",
}

export const PARTNER_LOOKUP_OPTIONS = [
  { value: PartnerLookupType.SUPPLIER, label: "Nhà cung cấp" },
  { value: PartnerLookupType.CUSTOMER, label: "Khách hàng" },
  { value: PartnerLookupType.EMPLOYEE, label: "Nhân viên" },
  { value: PartnerLookupType.OTHER, label: "Khác" },
] as const;

/** True for the one lookup type that has no catalogue behind it. */
export function isFreeTextLookupType(type: PartnerLookupType): boolean {
  return type === PartnerLookupType.OTHER;
}

export const PARTNER_LOOKUP_FILTER_OPTIONS: ReadonlyArray<{
  value: PartnerLookupType;
  label: string;
}> = [
  { value: PartnerLookupType.ALL, label: "Tất cả loại" },
  ...PARTNER_LOOKUP_OPTIONS,
];

export const PARTNER_LOOKUP_DIALOG_OPTIONS = PARTNER_LOOKUP_OPTIONS;

export const PARTNER_LOOKUP_DEFAULT = PartnerLookupType.CUSTOMER;

export const PARTNER_LOOKUP_LABEL: Record<PartnerLookupType, string> = {
  [PartnerLookupType.SUPPLIER]: "Nhà cung cấp",
  [PartnerLookupType.CUSTOMER]: "Khách hàng",
  [PartnerLookupType.EMPLOYEE]: "Nhân viên",
  [PartnerLookupType.ALL]: "Tất cả loại",
  [PartnerLookupType.OTHER]: "Khác",
};

export const DEBT_COLLECTION_PARTNER_OPTIONS = [
  { value: PartnerLookupType.CUSTOMER, label: "Khách hàng" },
] as const;

export function lookupTypeToPartnerType(
  type: PartnerLookupType,
): CashVoucherPartnerType {
  switch (type) {
    case PartnerLookupType.CUSTOMER:
      return CashVoucherPartnerType.CUSTOMER;
    case PartnerLookupType.EMPLOYEE:
      return CashVoucherPartnerType.EMPLOYEE;
    case PartnerLookupType.SUPPLIER:
      return CashVoucherPartnerType.SUPPLIER;
    case PartnerLookupType.OTHER:
      return CashVoucherPartnerType.OTHER;
    default:
      // Only ALL reaches here, and it is a filter value, never a saved party.
      return CashVoucherPartnerType.OTHER;
  }
}

export function inferLookupType(
  partnerType: CashVoucherPartnerType | undefined,
): PartnerLookupType {
  if (!partnerType) return PartnerLookupType.SUPPLIER;
  switch (partnerType) {
    case CashVoucherPartnerType.CUSTOMER:
      return PartnerLookupType.CUSTOMER;
    case CashVoucherPartnerType.EMPLOYEE:
      return PartnerLookupType.EMPLOYEE;
    case CashVoucherPartnerType.SUPPLIER:
      return PartnerLookupType.SUPPLIER;
    case CashVoucherPartnerType.OTHER:
      return PartnerLookupType.OTHER;
    default:
      return PartnerLookupType.SUPPLIER;
  }
}

export const VOUCHER_DOC_NO_PLACEHOLDER = "Sinh tự động";
