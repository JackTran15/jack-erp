import type {
  PromotionApplyTo,
  PromotionForm,
  PromotionStatus,
} from "./programs.types";

interface Option<T extends string> {
  value: T;
  label: string;
}

export const PROMOTION_APPLY_TO_OPTIONS: Option<PromotionApplyTo>[] = [
  { value: "ALL_CUSTOMERS", label: "Tất cả khách hàng" },
  { value: "CUSTOMER_GROUP", label: "Nhóm khách hàng" },
  { value: "SPECIFIC_CUSTOMER", label: "Khách hàng cụ thể" },
];

export const PROMOTION_FORM_OPTIONS: Option<PromotionForm>[] = [
  { value: "INVOICE_DISCOUNT", label: "Giảm giá hóa đơn" },
  { value: "PRODUCT_DISCOUNT", label: "Giảm giá hàng hóa" },
  { value: "TIERED_DISCOUNT", label: "Giảm giá theo mức" },
  { value: "GIFT", label: "Tặng hàng hóa" },
  { value: "BUY_M_GET_N", label: "Mua m tặng n" },
];

export const PROMOTION_STATUS_OPTIONS: Option<PromotionStatus>[] = [
  { value: "TRACKING", label: "Đang theo dõi" },
  { value: "PAUSED", label: "Tạm dừng" },
  { value: "ENDED", label: "Đã kết thúc" },
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
