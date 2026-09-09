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
] as const;

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

/**
 * Infers the outgoing party fields from what the form actually holds — the
 * one place both cash and bank voucher dialogs call to decide `partnerType`
 * (ADR-01: the flag is no longer a control the user sets, it is derived).
 *
 * Order matters: the catalogue branch (has `partnerId`) must be checked
 * before the free-text branch. The old code kept a `partnerId &&` guard on
 * its fallback branch and had to special-case free text *before* reaching
 * it, or a hand-typed name would silently fall through that guard and be
 * dropped. There is no such guard here anymore, but the same party can now
 * carry both an id and an edited name (ADR-02), so checking the id first is
 * still what keeps a catalogue link from being mistaken for `OTHER`.
 */
export function resolvePartyFields(input: {
  partnerId?: string;
  partnerKind?: PartnerLookupType;
  partnerName?: string;
}): {
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerName?: string;
} {
  const trimmedName = input.partnerName?.trim() || undefined;

  if (input.partnerId) {
    return {
      partnerType: input.partnerKind
        ? lookupTypeToPartnerType(input.partnerKind)
        : undefined,
      partnerId: input.partnerId,
      // ADR-02: an edited name must not cut the catalogue link, so it is
      // still sent alongside the id.
      partnerName: trimmedName,
    };
  }

  if (trimmedName) {
    return {
      partnerType: CashVoucherPartnerType.OTHER,
      partnerId: undefined,
      partnerName: trimmedName,
    };
  }

  return { partnerType: undefined, partnerId: undefined, partnerName: undefined };
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
