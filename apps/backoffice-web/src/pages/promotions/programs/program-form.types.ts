import type { PromotionApplyTo } from "./programs.types";

/** "Ngày tính KM" khi áp dụng cho khách hàng có sinh nhật. */
export type BirthdayDateMode = "WEEK" | "MONTH" | "RANGE";

/** Cách giảm giá: theo % hoặc theo số tiền. */
export type DiscountType = "PERCENT" | "AMOUNT";

/** Phạm vi cửa hàng áp dụng (chỉ dùng khi view = chuỗi cửa hàng). */
export type StoreScope = "ALL_CHAIN" | "SELECTED";

/** Phạm vi hàng hóa áp dụng trong hóa đơn. */
export type ApplyScope = "NON_PROMO_ONLY" | "ALL_ITEMS";

/** Ngày trong tuần (T2..CN). */
export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** Loại điều kiện áp dụng (tab "Điều kiện áp dụng"). */
export type ConditionType = "NONE" | "MIN_TOTAL" | "SPECIFIC_QUANTITY";

/** Phạm vi tính tổng tiền cho điều kiện "Tổng tiền hàng ≥". */
export type CalcBasis = "ALL_ITEMS" | "NOT_DISCOUNTED";

/** Một dòng hàng hóa áp dụng (bảng editable). */
export interface ApplicableGood {
  id: string;
  /** Id hàng hóa đã chọn từ tra cứu (rỗng khi chưa chọn). */
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  minQuantity: number | "";
}

/** Phạm vi giảm giá hàng hóa: theo nhóm hàng hóa hoặc theo từng hàng hóa. */
export type GoodsDiscountScope = "GROUP" | "PRODUCT";

/** Phương thức thiết lập giảm giá hàng hóa. */
export type GoodsDiscountMethod = "PERCENT" | "AMOUNT" | "FIXED_PRICE";

/** Một dòng thiết lập giảm giá hàng hóa (bảng editable). */
export interface GoodsDiscountRow {
  id: string;
  /** Mã nhóm hàng hóa (GROUP) hoặc mã hàng (PRODUCT). */
  code: string;
  /** Tên nhóm hàng hóa (GROUP) hoặc tên hàng hóa (PRODUCT). */
  name: string;
  /** % giảm (PERCENT) hoặc số tiền giảm (AMOUNT) theo phương thức. */
  value: number | "";
}

/** Đơn vị giảm giá theo mức (select 2 của "Loại giảm theo"). */
export type TierDiscountUnit = "PERCENT" | "AMOUNT";

/** "Tính trên": áp điều kiện số lượng theo từng hàng hóa hay gộp cả nhóm. */
export type TierBasis = "PER_ITEM" | "ALL_ITEMS";

/** "Giảm giá theo": đối tượng hàng hóa của grid chọn hàng. */
export type TierTarget = "PRODUCT" | "VARIANT" | "GROUP";

/** Một dòng hàng hóa trong grid chọn hàng của nhóm giảm giá theo mức. */
export interface TierProduct {
  id: string;
  /** Mã SKU / mã mẫu mã / mã nhóm hàng hóa (theo TierTarget). */
  code: string;
  name: string;
  unit: string;
}

/** Một bậc số lượng: [từ, đến] ứng với một mức giảm. */
export interface TierRow {
  id: string;
  from: number | "";
  to: number | "";
  /** % giảm (PERCENT) hoặc số tiền giảm (AMOUNT) theo TierDiscountUnit. */
  value: number | "";
}

/** Một nhóm khuyến mại theo mức: gồm grid hàng hóa + grid bậc thang số lượng. */
export interface TierGroup {
  id: string;
  name: string;
  products: TierProduct[];
  tiers: TierRow[];
}

/** Hình thức tặng: tặng một trong danh sách hoặc tặng tất cả. */
export type GiftMode = "ONE" | "ALL";

/** Một dòng hàng hóa quà tặng (grid 5 cột của loại "Tặng hàng hóa"). */
export interface GiftProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  /** Giá bán tối đa (prefix ≤). */
  price: number | "";
  /** Số lượng tối đa (prefix ≤). */
  quantity: number | "";
}

/** Chính sách tặng khi mua m tặng n: tặng hàng cụ thể hoặc tặng hàng rẻ nhất. */
export type BuyGetGiftPolicy = "SPECIFIC" | "CHEAPEST";

/** Một dòng hàng hóa trong grid mua-m-tặng-n (điều kiện mua hoặc hàng được tặng). */
export interface BuyGetRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** SL (điều kiện mua) hoặc SL tặng (hàng được tặng). */
  quantity: number | "";
}

/** Toàn bộ state của form tạo/sửa chương trình khuyến mãi (mọi loại khuyến mãi). */
export interface ProgramFormState {
  name: string;
  description: string;
  applyTo: PromotionApplyTo;
  /** "Ngày tính KM" — chỉ dùng khi applyTo = HAS_BIRTHDAY. */
  birthdayDateMode: BirthdayDateMode | "";
  /** Số ngày trước ngày sinh (khi birthdayDateMode = RANGE). */
  birthdayBeforeDays: number | "";
  /** Số ngày sau ngày sinh (khi birthdayDateMode = RANGE). */
  birthdayAfterDays: number | "";
  /** Hạng thẻ — chỉ dùng khi applyTo = HAS_CARD_TIER. */
  cardTier: string;
  /** ISO date yyyy-MM-dd hoặc rỗng. */
  startDate: string;
  endDate: string;
  daysOfWeek: DayOfWeek[];
  /** HH:mm hoặc rỗng. */
  startTime: string;
  endTime: string;
  storeScope: StoreScope;
  storeIds: string[];
  applyScope: ApplyScope;
  discountType: DiscountType;
  discountPercent: number | "";
  discountAmount: number | "";
  goodsDiscountScope: GoodsDiscountScope;
  goodsDiscountMethod: GoodsDiscountMethod;
  goodsFixedPrice: number | "";
  goodsDiscountRows: GoodsDiscountRow[];
  tierDiscountUnit: TierDiscountUnit;
  tierBasis: TierBasis;
  tierTarget: TierTarget;
  tierGroups: TierGroup[];
  giftMode: GiftMode;
  giftProducts: GiftProduct[];
  giftMultiplyByTotal: boolean;
  buyGetGiftPolicy: BuyGetGiftPolicy;
  buyGetPurchaseTarget: TierTarget;
  buyGetGiftMode: GiftMode;
  buyGetPurchaseRows: BuyGetRow[];
  buyGetGiftRows: BuyGetRow[];
  autoApply: boolean;
  conditionType: ConditionType;
  minTotalAmount: number | "";
  calcBasis: CalcBasis;
  applicableGoods: ApplicableGood[];
}
