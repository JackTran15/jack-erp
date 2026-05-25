import { CashVoucherPartnerType } from "../../cash-vouchers.types";

export enum PartnerLookupType {
  EMPLOYEE = "employee",
  CUSTOMER = "customer",
  SUPPLIER = "supplier",
  ALL = "all",
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
    default:
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
    default:
      return PartnerLookupType.SUPPLIER;
  }
}

export const VOUCHER_DOC_NO_PLACEHOLDER = "Sinh tự động";
