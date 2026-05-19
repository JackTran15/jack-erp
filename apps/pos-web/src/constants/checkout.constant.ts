import type { PaymentMethodOption } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import type { ApiPaymentMethod } from "@erp/pos/dtos/invoice.dto";

// ============================================================================
// Customer (purchase history, debt, detail tabs)
// ============================================================================

export enum PurchaseHistoryStatusEnum {
  PAID = "PAID",
  DEBT = "DEBT",
}

export type PurchaseHistoryStatus = PurchaseHistoryStatusEnum;

export enum PurchaseHistoryStatusFilterEnum {
  ALL = "ALL",
  PAID = PurchaseHistoryStatusEnum.PAID,
  DEBT = PurchaseHistoryStatusEnum.DEBT,
}

export type PurchaseHistoryStatusFilter = PurchaseHistoryStatusFilterEnum;

export enum CustomerDetailTabKeyEnum {
  OVERVIEW = "overview",
  INFO = "info",
  HISTORY = "history",
  DEBT = "debt",
}

export type CustomerDetailTabKey = CustomerDetailTabKeyEnum;

export enum DebtTypeFilterEnum {
  ALL = "ALL",
  REDUCE_DEBT_RETURN_INVOICE = "Giảm nợ theo hóa đơn đổi trả",
  SALES_INVOICE_WITH_DEBT = "Hóa đơn bán hàng ghi nợ",
  CASH_RECEIPT = "Phiếu thu tiền mặt",
  COLLECT_DEBT_CASH = "Thu nợ khách hàng bằng tiền mặt",
  STORE_SALES_INVOICE = "Hóa đơn bán hàng tại cửa hàng",
  DEPOSIT_RECEIPT = "Thu tiền gửi",
  COLLECT_DEBT_CARD = "Thu nợ khách hàng bằng thẻ",
}

// ============================================================================
// Filter operators (text & number)
// ============================================================================

export enum FilterOperatorEnum {
  CONTAINS = "CONTAINS",
  EQUALS = "EQUALS",
  STARTS_WITH = "STARTS_WITH",
  ENDS_WITH = "ENDS_WITH",
  NOT_CONTAINS = "NOT_CONTAINS",
  LESS_THAN = "LESS_THAN",
  LESS_THAN_OR_EQUAL = "LESS_THAN_OR_EQUAL",
  GREATER_THAN = "GREATER_THAN",
  GREATER_THAN_OR_EQUAL = "GREATER_THAN_OR_EQUAL",
}

export enum FilterOperatorTypeEnum {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
}

export interface FilterOperatorOption {
  value: FilterOperatorEnum;
  selectedDisplay: string;
  label: string;
}

export const OPERATOR_OPTIONS: Record<
  FilterOperatorTypeEnum,
  ReadonlyArray<FilterOperatorOption>
> = {
  [FilterOperatorTypeEnum.TEXT]: [
    {
      value: FilterOperatorEnum.CONTAINS,
      selectedDisplay: "*",
      label: "* : Chứa",
    },
    {
      value: FilterOperatorEnum.EQUALS,
      selectedDisplay: "=",
      label: "= : Bằng",
    },
    {
      value: FilterOperatorEnum.STARTS_WITH,
      selectedDisplay: "+",
      label: "+ : Bắt đầu bằng",
    },
    {
      value: FilterOperatorEnum.ENDS_WITH,
      selectedDisplay: "-",
      label: "- : Kết thúc bằng",
    },
    {
      value: FilterOperatorEnum.NOT_CONTAINS,
      selectedDisplay: "!",
      label: "! : Không chứa",
    },
  ],
  [FilterOperatorTypeEnum.NUMBER]: [
    {
      value: FilterOperatorEnum.EQUALS,
      selectedDisplay: "=",
      label: "= : Bằng",
    },
    {
      value: FilterOperatorEnum.LESS_THAN,
      selectedDisplay: "<",
      label: "< : Nhỏ hơn",
    },
    {
      value: FilterOperatorEnum.LESS_THAN_OR_EQUAL,
      selectedDisplay: "≤",
      label: "≤ : Nhỏ hơn hoặc bằng",
    },
    {
      value: FilterOperatorEnum.GREATER_THAN,
      selectedDisplay: ">",
      label: "> : Lớn hơn",
    },
    {
      value: FilterOperatorEnum.GREATER_THAN_OR_EQUAL,
      selectedDisplay: "≥",
      label: "≥ : Lớn hơn hoặc bằng",
    },
  ],
};

// ============================================================================
// Payment method
// ============================================================================

export enum PaymentMethodEnum {
  CASH = "CASH",
  CARD = "CARD",
  TRANSFER = "TRANSFER",
}

export type PaymentMethod = PaymentMethodEnum;

export const PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  { value: PaymentMethodEnum.CASH, label: "Tiền mặt" },
  { value: PaymentMethodEnum.CARD, label: "Thẻ" },
  { value: PaymentMethodEnum.TRANSFER, label: "Chuyển khoản" },
];

// ============================================================================
// Invoice API — payment method ↔ BE enum
// ============================================================================
// `revenueAccountId`, `receivableAccountId` và per-line `accountId` được
// resolve runtime qua `useRevenueAccountsQuery` / `useReceivableAccountsQuery`
// / `usePaymentAccountsQuery` (xem `hooks/react-query/use-accounts.ts`).

export const PAYMENT_METHOD_TO_API_METHOD: Record<
  PaymentMethod,
  ApiPaymentMethod
> = {
  [PaymentMethodEnum.CASH]: "cash",
  [PaymentMethodEnum.CARD]: "card",
  [PaymentMethodEnum.TRANSFER]: "bank_transfer",
};

// ============================================================================
// Promo menu
// ============================================================================

export enum PromoMenuOptionEnum {
  PROMO = "promo",
  VOUCHER = "voucher",
  DISCOUNT = "discount",
}

export type PromoMenuOption = PromoMenuOptionEnum;

// ============================================================================
// Promotion
// ============================================================================

export enum PromotionStatusEnum {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  EXPIRED = "EXPIRED",
  SCHEDULED = "SCHEDULED",
}

export type PromotionStatus = PromotionStatusEnum;

export enum PromotionStatusToneEnum {
  SUCCESS = "success",
  WARNING = "warning",
  MUTED = "muted",
  INFO = "info",
}

export type PromotionStatusTone = PromotionStatusToneEnum;

export enum PromotionKindEnum {
  AMOUNT_OFF = "AMOUNT_OFF",
  PERCENT_OFF = "PERCENT_OFF",
  GIFT = "GIFT",
  VOUCHER = "VOUCHER",
  LOYALTY = "LOYALTY",
  CUSTOM = "CUSTOM",
}

export type PromotionKind = PromotionKindEnum;

// ============================================================================
// Voucher
// ============================================================================

export enum VoucherApplyScopeEnum {
  INVOICE = "INVOICE",
  ITEMS = "ITEMS",
  GROUPS = "GROUPS",
}

export type VoucherApplyScope = VoucherApplyScopeEnum;
