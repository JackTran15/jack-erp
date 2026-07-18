import type { PromotionApplyTo } from "./programs.types";

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
export type CalcBasis = "ALL_ITEMS" | "SELECTED_ITEMS";

/** Một dòng hàng hóa áp dụng (bảng editable). */
export interface ApplicableGood {
  id: string;
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

/** Toàn bộ state của form tạo/sửa chương trình khuyến mãi (giảm giá hóa đơn & giảm giá hàng hóa). */
export interface ProgramFormState {
  name: string;
  description: string;
  applyTo: PromotionApplyTo;
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
  autoApply: boolean;
  conditionType: ConditionType;
  minTotalAmount: number | "";
  calcBasis: CalcBasis;
  applicableGoods: ApplicableGood[];
}
