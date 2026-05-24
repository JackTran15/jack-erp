import type {
  PaymentMethodOption,
  PriceBook,
  ProductGroup,
  Salesperson,
  SaleChannelOption,
} from "@erp/pos/interfaces/checkout.interface";
import type {
  ApiPaymentMethod,
  InvoicePaymentMethod,
} from "@erp/pos/types/invoice.type";

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
// Toolbar option tĩnh (chờ API thay thế)
// ============================================================================

export const PRICE_BOOK_OPTIONS: readonly PriceBook[] = [
  { id: "default", name: "Bảng giá chuẩn" },
  { id: "vip", name: "Bảng giá VIP" },
  { id: "wholesale", name: "Bảng giá sỉ" },
];

export const SALESPERSON_OPTIONS: readonly Salesperson[] = [
  { id: "nv01", code: "NV01", name: "Nguyễn Văn A" },
  { id: "nv02", code: "NV02", name: "Trần Thị B" },
  { id: "nv03", code: "NV03", name: "Lê Văn C" },
];

export const CATALOG_GROUP_OPTIONS: readonly ProductGroup[] = [
  { id: "all", name: "Tất cả" },
  { id: "drink", name: "Nước uống" },
  { id: "food", name: "Đồ ăn" },
  { id: "other", name: "Khác" },
];

// ============================================================================
// Sale channel (kênh bán hàng — popover "Tại cửa hàng")
// ============================================================================

export const DEFAULT_SALE_CHANNEL_ID = "at-store";

/** Bộ màu bubble lấy từ design token mục 2.1 của TaiCuaHang.md. */
export const SALE_CHANNELS: readonly SaleChannelOption[] = [
  {
    id: "at-store",
    label: "Tại cửa hàng",
    bubbleClassName: "bg-gradient-to-br from-[#7C7FE8] to-[#5A5DD8]",
    isStore: true,
  },
  { id: "facebook", label: "Facebook", bubbleClassName: "bg-[#1877F2]", initial: "f" },
  { id: "zalo", label: "Zalo", bubbleClassName: "bg-[#0084FF]", initial: "Z" },
  { id: "instagram", label: "Instagram", bubbleClassName: "bg-[#E1306C]", initial: "I" },
  { id: "tiki", label: "Tiki", bubbleClassName: "bg-[#1BA9E1]", initial: "T" },
  { id: "lazada", label: "Lazada", bubbleClassName: "bg-[#0F1F8F]", initial: "L" },
  { id: "shopee", label: "Shopee", bubbleClassName: "bg-[#EE4D2D]", initial: "S" },
];

// ============================================================================
// Invoice API — payment method ↔ BE enum
// ============================================================================
// Mỗi dòng thanh toán mang `paymentAccountId` (id của tài khoản đã cấu hình, lấy
// từ `usePaymentAccountsQuery`). BE tự suy ra COA account + tài khoản doanh thu /
// công nợ phải thu; FE không gửi `revenueAccountId` / `receivableAccountId` nữa.

export const PAYMENT_METHOD_TO_API_METHOD: Record<
  PaymentMethod,
  ApiPaymentMethod
> = {
  [PaymentMethodEnum.CASH]: "cash",
  [PaymentMethodEnum.CARD]: "card",
  [PaymentMethodEnum.TRANSFER]: "bank_transfer",
};

/** Chiều ngược lại: method BE trên một tài khoản đã cấu hình → enum UI. */
export const API_METHOD_TO_PAYMENT_METHOD: Record<
  ApiPaymentMethod,
  PaymentMethod
> = {
  cash: PaymentMethodEnum.CASH,
  card: PaymentMethodEnum.CARD,
  bank_transfer: PaymentMethodEnum.TRANSFER,
};

/** Nhãn tiếng Việt cho `invoice.paymentMethod` (dùng ở biên lai chi tiết). */
export const INVOICE_PAYMENT_METHOD_LABEL: Record<InvoicePaymentMethod, string> =
  {
    cash: "Tiền mặt",
    bank_transfer: "Chuyển khoản",
    card: "Thẻ",
    debt: "Ghi nợ",
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
