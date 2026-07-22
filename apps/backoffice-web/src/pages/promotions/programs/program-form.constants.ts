import type {
  ApplicableGood,
  ApplyScope,
  BirthdayDateMode,
  BuyGetGiftPolicy,
  BuyGetRow,
  CalcBasis,
  DayOfWeek,
  GoodsDiscountMethod,
  GoodsDiscountRow,
  GoodsDiscountScope,
  GiftMode,
  GiftProduct,
  ProgramFormState,
  StoreScope,
  TierBasis,
  TierDiscountUnit,
  TierGroup,
  TierProduct,
  TierRow,
  TierTarget,
} from "./program-form.types";
import { PromotionApplyTo } from "./programs.constants";

/** Bề rộng cột label dùng chung cho các FormField horizontal của form KM. */
export const FORM_LABEL_WIDTH = "11rem";

export const BIRTHDAY_DATE_MODE_OPTIONS: {
  value: BirthdayDateMode;
  label: string;
}[] = [
  { value: "WEEK", label: "Trong tuần chứa ngày sinh nhật" },
  { value: "MONTH", label: "Trong tháng chứa ngày sinh nhật" },
  { value: "RANGE", label: "Trong khoảng chứa ngày sinh nhật" },
];

export const CARD_TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "MEMBER", label: "Thẻ thành viên" },
];

export const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: "MON", label: "Thứ 2" },
  { value: "TUE", label: "Thứ 3" },
  { value: "WED", label: "Thứ 4" },
  { value: "THU", label: "Thứ 5" },
  { value: "FRI", label: "Thứ 6" },
  { value: "SAT", label: "Thứ 7" },
  { value: "SUN", label: "Chủ nhật" },
];

export const STORE_SCOPE_OPTIONS: { value: StoreScope; label: string }[] = [
  { value: "ALL_CHAIN", label: "Toàn bộ chuỗi cửa hàng" },
  { value: "SELECTED", label: "Các cửa hàng được chọn" },
];

export const APPLY_SCOPE_OPTIONS: { value: ApplyScope; label: string }[] = [
  { value: "NON_PROMO_ONLY", label: "Chỉ hàng hóa chưa áp dụng khuyến mại" },
  { value: "ALL_ITEMS", label: "Tất cả hàng hóa trong hóa đơn" },
];

export const CALC_BASIS_OPTIONS: { value: CalcBasis; label: string }[] = [
  { value: "ALL_ITEMS", label: "Tất cả hàng hóa" },
  { value: "NOT_DISCOUNTED", label: "Hàng hóa chưa khuyến mại" },
];

export const GOODS_DISCOUNT_SCOPE_OPTIONS: {
  value: GoodsDiscountScope;
  label: string;
}[] = [
  { value: "GROUP", label: "Nhóm hàng hóa" },
  { value: "PRODUCT", label: "Hàng hóa" },
];

export const GOODS_DISCOUNT_METHOD_OPTIONS: {
  value: GoodsDiscountMethod;
  label: string;
}[] = [
  { value: "PERCENT", label: "Giảm giá theo %" },
  { value: "AMOUNT", label: "Giảm giá theo số tiền" },
  { value: "FIXED_PRICE", label: "Đồng giá" },
];

export function blankApplicableGood(): ApplicableGood {
  return {
    id: crypto.randomUUID(),
    itemId: "",
    sku: "",
    name: "",
    unit: "",
    minQuantity: "",
  };
}

export function blankGoodsDiscountRow(): GoodsDiscountRow {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    value: "",
  };
}

export const TIER_DISCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "QUANTITY", label: "Số lượng hàng mua" },
];

export const TIER_DISCOUNT_UNIT_OPTIONS: {
  value: TierDiscountUnit;
  label: string;
}[] = [
  { value: "PERCENT", label: "Giảm giá theo phần trăm(%)" },
  { value: "AMOUNT", label: "Giảm giá theo số tiền" },
];

export const TIER_BASIS_OPTIONS: { value: TierBasis; label: string }[] = [
  { value: "PER_ITEM", label: "Từng hàng hóa trong nhóm khuyến mại" },
  { value: "ALL_ITEMS", label: "Tất cả hàng hóa trong nhóm khuyến mại" },
];

export const TIER_TARGET_OPTIONS: { value: TierTarget; label: string }[] = [
  { value: "PRODUCT", label: "Hàng hóa" },
  { value: "VARIANT", label: "Mẫu mã" },
  { value: "GROUP", label: "Nhóm hàng hóa" },
];

export function blankTierProduct(): TierProduct {
  return { id: crypto.randomUUID(), code: "", name: "", unit: "" };
}

export function blankTierRow(): TierRow {
  return { id: crypto.randomUUID(), from: "", to: "", value: "" };
}

export function blankTierGroup(index: number): TierGroup {
  return {
    id: crypto.randomUUID(),
    name: `Nhóm ${index}`,
    products: [blankTierProduct()],
    tiers: [blankTierRow()],
  };
}

export const GIFT_MODE_OPTIONS: { value: GiftMode; label: string }[] = [
  { value: "ONE", label: "Tặng một trong danh sách hàng hóa" },
  { value: "ALL", label: "Tặng tất cả trong danh sách hàng hóa" },
];

export function blankGiftProduct(): GiftProduct {
  return {
    id: crypto.randomUUID(),
    sku: "",
    name: "",
    unit: "",
    price: "",
    quantity: "",
  };
}

export const BUY_GET_GIFT_POLICY_OPTIONS: {
  value: BuyGetGiftPolicy;
  label: string;
}[] = [
  { value: "SPECIFIC", label: "Tặng hàng hóa cụ thể" },
  { value: "CHEAPEST", label: "Tặng hàng hóa rẻ nhất" },
];

export function blankBuyGetRow(): BuyGetRow {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    unit: "",
    quantity: "",
  };
}

export function buildInitialFormState(): ProgramFormState {
  return {
    name: "",
    description: "",
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    birthdayDateMode: "",
    birthdayBeforeDays: 0,
    birthdayAfterDays: 0,
    cardTier: "",
    startDate: "",
    endDate: "",
    daysOfWeek: [],
    startTime: "",
    endTime: "",
    storeScope: "ALL_CHAIN",
    storeIds: [],
    applyScope: "NON_PROMO_ONLY",
    discountType: "PERCENT",
    discountPercent: 0,
    discountAmount: 0,
    goodsDiscountScope: "GROUP",
    goodsDiscountMethod: "PERCENT",
    goodsFixedPrice: 0,
    goodsDiscountRows: [blankGoodsDiscountRow()],
    tierDiscountUnit: "PERCENT",
    tierBasis: "PER_ITEM",
    tierTarget: "PRODUCT",
    tierGroups: [blankTierGroup(1)],
    giftMode: "ONE",
    giftProducts: [blankGiftProduct()],
    giftMultiplyByTotal: false,
    buyGetGiftPolicy: "SPECIFIC",
    buyGetPurchaseTarget: "PRODUCT",
    buyGetGiftMode: "ONE",
    buyGetPurchaseRows: [blankBuyGetRow()],
    buyGetGiftRows: [blankBuyGetRow()],
    autoApply: true,
    conditionType: "NONE",
    minTotalAmount: 0,
    calcBasis: "ALL_ITEMS",
    applicableGoods: [blankApplicableGood()],
  };
}
