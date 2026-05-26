import { CashVoucherPartnerType } from "../../cash-vouchers.types";

export enum VoucherPartnerKindUi {
  SUPPLIER = "supplier",
  CUSTOMER = "customer",
  PARTNER = "partner",
  EMPLOYEE = "employee",
}

export const VOUCHER_PARTNER_KIND_OPTIONS = [
  { value: VoucherPartnerKindUi.SUPPLIER, label: "Nhà cung cấp" },
  { value: VoucherPartnerKindUi.CUSTOMER, label: "Khách hàng" },
  { value: VoucherPartnerKindUi.PARTNER, label: "Đối tác" },
  { value: VoucherPartnerKindUi.EMPLOYEE, label: "Nhân viên" },
] as const;

export const VOUCHER_PARTNER_KIND_FILTER_ALL = "all" as const;

export type VoucherPartnerKindFilter =
  | typeof VOUCHER_PARTNER_KIND_FILTER_ALL
  | VoucherPartnerKindUi;

export const VOUCHER_PARTNER_KIND_FILTER_OPTIONS: ReadonlyArray<{
  value: VoucherPartnerKindFilter;
  label: string;
}> = [
  { value: VOUCHER_PARTNER_KIND_FILTER_ALL, label: "Tất cả loại" },
  ...VOUCHER_PARTNER_KIND_OPTIONS,
];

export const VOUCHER_PARTNER_KIND_DIALOG_OPTIONS = VOUCHER_PARTNER_KIND_OPTIONS;

export const VOUCHER_PARTNER_DEFAULT_KIND = VoucherPartnerKindUi.CUSTOMER;

export const VOUCHER_PARTNER_KIND_LABEL: Record<VoucherPartnerKindUi, string> = {
  [VoucherPartnerKindUi.SUPPLIER]: "Nhà cung cấp",
  [VoucherPartnerKindUi.CUSTOMER]: "Khách hàng",
  [VoucherPartnerKindUi.PARTNER]: "Đối tác giao hàng",
  [VoucherPartnerKindUi.EMPLOYEE]: "Nhân viên",
};

export const DEBT_COLLECTION_PARTNER_KIND_OPTIONS = [
  { value: VoucherPartnerKindUi.CUSTOMER, label: "Khách hàng" },
  {
    value: VoucherPartnerKindUi.PARTNER,
    label: VOUCHER_PARTNER_KIND_LABEL[VoucherPartnerKindUi.PARTNER],
  },
] as const;

export function providerUiKindFromCode(code: string): VoucherPartnerKindUi {
  return code.toUpperCase().startsWith(DELIVERY_PARTNER_CODE_PREFIX)
    ? VoucherPartnerKindUi.PARTNER
    : VoucherPartnerKindUi.SUPPLIER;
}

export const DELIVERY_PARTNER_CODE_PREFIX = "DTGH";

export function partnerKindToBeType(
  kind: VoucherPartnerKindUi,
): CashVoucherPartnerType {
  switch (kind) {
    case VoucherPartnerKindUi.CUSTOMER:
      return CashVoucherPartnerType.CUSTOMER;
    case VoucherPartnerKindUi.EMPLOYEE:
      return CashVoucherPartnerType.EMPLOYEE;
    case VoucherPartnerKindUi.SUPPLIER:
    case VoucherPartnerKindUi.PARTNER:
      return CashVoucherPartnerType.SUPPLIER;
    default:
      return CashVoucherPartnerType.OTHER;
  }
}

export function inferPartnerKindFromBe(
  partnerType: CashVoucherPartnerType | undefined,
  partnerCode: string | undefined,
): VoucherPartnerKindUi {
  if (!partnerType) return VoucherPartnerKindUi.SUPPLIER;
  switch (partnerType) {
    case CashVoucherPartnerType.CUSTOMER:
      return VoucherPartnerKindUi.CUSTOMER;
    case CashVoucherPartnerType.EMPLOYEE:
      return VoucherPartnerKindUi.EMPLOYEE;
    case CashVoucherPartnerType.SUPPLIER:
      if (
        partnerCode &&
        partnerCode.toUpperCase().startsWith(DELIVERY_PARTNER_CODE_PREFIX)
      ) {
        return VoucherPartnerKindUi.PARTNER;
      }
      return VoucherPartnerKindUi.SUPPLIER;
    default:
      return VoucherPartnerKindUi.SUPPLIER;
  }
}

export const VOUCHER_DOC_NO_PLACEHOLDER = "Sinh tự động khi hạch toán";
