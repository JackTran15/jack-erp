import type {
  ApplicableGood,
  ApplyScope,
  CalcBasis,
  DayOfWeek,
  ProgramFormState,
  StoreScope,
} from "./program-form.types";

/** Bề rộng cột label dùng chung cho các FormField horizontal của form KM. */
export const FORM_LABEL_WIDTH = "11rem";

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
  { value: "SELECTED_ITEMS", label: "Hàng hóa được chọn" },
];

export function blankApplicableGood(): ApplicableGood {
  return {
    id: crypto.randomUUID(),
    sku: "",
    name: "",
    unit: "",
    minQuantity: "",
  };
}

export function buildInitialFormState(): ProgramFormState {
  return {
    name: "",
    description: "",
    applyTo: "ALL_CUSTOMERS",
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
    autoApply: true,
    conditionType: "NONE",
    minTotalAmount: 0,
    calcBasis: "ALL_ITEMS",
    applicableGoods: [blankApplicableGood()],
  };
}
