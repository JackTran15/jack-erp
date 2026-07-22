import type {
  ApplicableGood,
  ApplicableGroup,
  BuyGetRow,
  GoodsDiscountRow,
  GiftProduct,
  ProgramFormState,
  TierGroup,
  TierProduct,
  TierRow,
} from "./program-form.types";
import {
  ApplyScope,
  BirthdayDateMode,
  BuyGetGiftPolicy,
  CalcBasis,
  ConditionType,
  DayOfWeek,
  DiscountType,
  GiftMode,
  GoodsDiscountMethod,
  GoodsDiscountScope,
  ProductGroupLogic,
  StoreScope,
  TierBasis,
  TierDiscountUnit,
  TierTarget,
} from "./program-form.types";
import { PromotionApplyTo } from "./programs.constants";

/** Bề rộng cột label dùng chung cho các FormField horizontal của form KM. */
export const FORM_LABEL_WIDTH = "11rem";

export const BIRTHDAY_DATE_MODE_OPTIONS: {
  value: BirthdayDateMode;
  label: string;
}[] = [
  { value: BirthdayDateMode.WEEK, label: "Trong tuần chứa ngày sinh nhật" },
  { value: BirthdayDateMode.MONTH, label: "Trong tháng chứa ngày sinh nhật" },
  { value: BirthdayDateMode.RANGE, label: "Trong khoảng chứa ngày sinh nhật" },
];

export const CARD_TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "MEMBER", label: "Thẻ thành viên" },
];

export const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: DayOfWeek.MON, label: "Thứ 2" },
  { value: DayOfWeek.TUE, label: "Thứ 3" },
  { value: DayOfWeek.WED, label: "Thứ 4" },
  { value: DayOfWeek.THU, label: "Thứ 5" },
  { value: DayOfWeek.FRI, label: "Thứ 6" },
  { value: DayOfWeek.SAT, label: "Thứ 7" },
  { value: DayOfWeek.SUN, label: "Chủ nhật" },
];

export const STORE_SCOPE_OPTIONS: { value: StoreScope; label: string }[] = [
  { value: StoreScope.ALL_CHAIN, label: "Toàn bộ chuỗi cửa hàng" },
  { value: StoreScope.SELECTED, label: "Các cửa hàng được chọn" },
];

export const APPLY_SCOPE_OPTIONS: { value: ApplyScope; label: string }[] = [
  { value: ApplyScope.NON_PROMO_ONLY, label: "Chỉ hàng hóa chưa áp dụng khuyến mại" },
  { value: ApplyScope.ALL_ITEMS, label: "Tất cả hàng hóa trong hóa đơn" },
];

export const CALC_BASIS_OPTIONS: { value: CalcBasis; label: string }[] = [
  { value: CalcBasis.ALL_ITEMS, label: "Tất cả hàng hóa" },
  { value: CalcBasis.NOT_DISCOUNTED, label: "Hàng hóa chưa khuyến mại" },
  { value: CalcBasis.PRODUCT_GROUP, label: "Hàng hóa thuộc nhóm hàng hóa" },
];

export const GOODS_DISCOUNT_SCOPE_OPTIONS: {
  value: GoodsDiscountScope;
  label: string;
}[] = [
  { value: GoodsDiscountScope.GROUP, label: "Nhóm hàng hóa" },
  { value: GoodsDiscountScope.PRODUCT, label: "Hàng hóa" },
];

export const GOODS_DISCOUNT_METHOD_OPTIONS: {
  value: GoodsDiscountMethod;
  label: string;
}[] = [
  { value: GoodsDiscountMethod.PERCENT, label: "Giảm giá theo %" },
  { value: GoodsDiscountMethod.AMOUNT, label: "Giảm giá theo số tiền" },
  { value: GoodsDiscountMethod.FIXED_PRICE, label: "Đồng giá" },
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

export function blankApplicableGroup(): ApplicableGroup {
  return { id: crypto.randomUUID(), groupId: "", code: "", name: "" };
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
  { value: TierDiscountUnit.PERCENT, label: "Giảm giá theo phần trăm(%)" },
  { value: TierDiscountUnit.AMOUNT, label: "Giảm giá theo số tiền" },
];

export const TIER_BASIS_OPTIONS: { value: TierBasis; label: string }[] = [
  { value: TierBasis.PER_ITEM, label: "Từng hàng hóa trong nhóm khuyến mại" },
  { value: TierBasis.ALL_ITEMS, label: "Tất cả hàng hóa trong nhóm khuyến mại" },
];

export const TIER_TARGET_OPTIONS: { value: TierTarget; label: string }[] = [
  { value: TierTarget.PRODUCT, label: "Hàng hóa" },
  { value: TierTarget.VARIANT, label: "Mẫu mã" },
  { value: TierTarget.GROUP, label: "Nhóm hàng hóa" },
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
  { value: GiftMode.ONE, label: "Tặng một trong danh sách hàng hóa" },
  { value: GiftMode.ALL, label: "Tặng tất cả trong danh sách hàng hóa" },
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
  { value: BuyGetGiftPolicy.SPECIFIC, label: "Tặng hàng hóa cụ thể" },
  { value: BuyGetGiftPolicy.CHEAPEST, label: "Tặng hàng hóa rẻ nhất" },
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
    applicableGroupLogic: ProductGroupLogic.ALL,
    applicableGroups: [],
    birthdayDateMode: "",
    birthdayBeforeDays: 0,
    birthdayAfterDays: 0,
    cardTier: "",
    startDate: "",
    endDate: "",
    daysOfWeek: [],
    startTime: "",
    endTime: "",
    storeScope: StoreScope.ALL_CHAIN,
    storeIds: [],
    applyScope: ApplyScope.NON_PROMO_ONLY,
    discountType: DiscountType.PERCENT,
    discountPercent: 0,
    discountAmount: 0,
    goodsDiscountScope: GoodsDiscountScope.GROUP,
    goodsDiscountMethod: GoodsDiscountMethod.PERCENT,
    goodsFixedPrice: 0,
    goodsDiscountRows: [blankGoodsDiscountRow()],
    tierDiscountUnit: TierDiscountUnit.PERCENT,
    tierBasis: TierBasis.PER_ITEM,
    tierTarget: TierTarget.PRODUCT,
    tierGroups: [blankTierGroup(1)],
    giftMode: GiftMode.ONE,
    giftProducts: [blankGiftProduct()],
    giftMultiplyByTotal: false,
    buyGetGiftPolicy: BuyGetGiftPolicy.SPECIFIC,
    buyGetPurchaseTarget: TierTarget.PRODUCT,
    buyGetGiftMode: GiftMode.ONE,
    buyGetPurchaseRows: [blankBuyGetRow()],
    buyGetGiftRows: [blankBuyGetRow()],
    autoApply: true,
    conditionType: ConditionType.NONE,
    minTotalAmount: 0,
    calcBasis: CalcBasis.ALL_ITEMS,
    applicableGoods: [blankApplicableGood()],
  };
}
