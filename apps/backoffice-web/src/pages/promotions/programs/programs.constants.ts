/** Đối tượng áp dụng khuyến mãi. */
export enum PromotionApplyTo {
  ALL_CUSTOMERS = "ALL_CUSTOMERS",
  CUSTOMER_GROUP = "CUSTOMER_GROUP",
  SPECIFIC_CUSTOMER = "SPECIFIC_CUSTOMER",
}

/** Hình thức khuyến mãi (5 loại — khớp menu "Thêm mới"). */
export enum PromotionForm {
  INVOICE_DISCOUNT = "INVOICE_DISCOUNT",
  PRODUCT_DISCOUNT = "PRODUCT_DISCOUNT",
  TIERED_DISCOUNT = "TIERED_DISCOUNT",
  GIFT = "GIFT",
  BUY_M_GET_N = "BUY_M_GET_N",
}

/** Trạng thái theo dõi chương trình. */
export enum PromotionStatus {
  TRACKING = "TRACKING",
  PAUSED = "PAUSED",
  ENDED = "ENDED",
}

interface Option<T extends string> {
  value: T;
  label: string;
}

export const PROMOTION_APPLY_TO_OPTIONS: Option<PromotionApplyTo>[] = [
  { value: PromotionApplyTo.ALL_CUSTOMERS, label: "Tất cả khách hàng" },
  { value: PromotionApplyTo.CUSTOMER_GROUP, label: "Nhóm khách hàng" },
  { value: PromotionApplyTo.SPECIFIC_CUSTOMER, label: "Khách hàng cụ thể" },
];

export const PROMOTION_FORM_OPTIONS: Option<PromotionForm>[] = [
  { value: PromotionForm.INVOICE_DISCOUNT, label: "Giảm giá hóa đơn" },
  // { value: PromotionForm.PRODUCT_DISCOUNT, label: "Giảm giá hàng hóa" },
  // { value: PromotionForm.TIERED_DISCOUNT, label: "Giảm giá theo mức" },
  // { value: PromotionForm.GIFT, label: "Tặng hàng hóa" },
  // { value: PromotionForm.BUY_M_GET_N, label: "Mua m tặng n" },
];

export const PROMOTION_STATUS_OPTIONS: Option<PromotionStatus>[] = [
  { value: PromotionStatus.TRACKING, label: "Đang theo dõi" },
  { value: PromotionStatus.PAUSED, label: "Tạm dừng" },
  { value: PromotionStatus.ENDED, label: "Đã kết thúc" },
];

/** Menu con của nút "Thêm mới" — 5 loại chương trình khuyến mãi. */
export const ADD_NEW_TYPE_OPTIONS = PROMOTION_FORM_OPTIONS;

function toLabelMap<T extends string>(options: Option<T>[]): Record<T, string> {
  return options.reduce(
    (acc, opt) => {
      acc[opt.value] = opt.label;
      return acc;
    },
    {} as Record<T, string>,
  );
}

export const PROMOTION_APPLY_TO_LABELS = toLabelMap(PROMOTION_APPLY_TO_OPTIONS);
export const PROMOTION_FORM_LABELS = toLabelMap(PROMOTION_FORM_OPTIONS);
export const PROMOTION_STATUS_LABELS = toLabelMap(PROMOTION_STATUS_OPTIONS);
