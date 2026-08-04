import {
  PromotionApplyTo as ApiApplyTo,
  PromotionProgramType,
  PromotionStatus as ApiStatus,
} from "@erp/shared-interfaces";

/**
 * Nhãn hiển thị theo **enum của API** — dùng cho danh sách và bộ lọc, nơi dữ liệu
 * đến thẳng từ `PromotionProgramSummary`.
 *
 * Khác với `PROMOTION_*_OPTIONS` bên dưới: những cái đó là *lựa chọn nhập liệu*
 * của form (view-model FE, xem `program-form.types.ts`). Tách hai thứ ra vì một
 * giá trị có thể **hiển thị được** mà **chưa nhập được** — ví dụ `CUSTOMER_GROUP`:
 * API nhận, POS có thể tạo, nhưng form chưa có ô chọn nhóm khách hàng nên không
 * đưa vào danh sách chọn. Gộp chung là lý do cột "Áp dụng cho" từng render ô rỗng.
 */
export const PROMOTION_TYPE_LABELS_VI: Record<PromotionProgramType, string> = {
  [PromotionProgramType.INVOICE_DISCOUNT]: "Giảm giá hóa đơn",
  [PromotionProgramType.ITEM_DISCOUNT]: "Giảm giá hàng hóa",
  [PromotionProgramType.TIERED_DISCOUNT]: "Giảm giá theo mức",
  [PromotionProgramType.GIFT_ITEM]: "Tặng hàng hóa",
  [PromotionProgramType.BUY_M_GET_N]: "Mua m tặng n",
};

export const PROMOTION_STATUS_LABELS_VI: Record<ApiStatus, string> = {
  [ApiStatus.TRACKING]: "Đang theo dõi",
  [ApiStatus.STOPPED]: "Ngừng theo dõi",
};

export const PROMOTION_APPLY_TO_LABELS_VI: Record<ApiApplyTo, string> = {
  [ApiApplyTo.ALL_CUSTOMERS]: "Tất cả khách hàng",
  [ApiApplyTo.CUSTOMER_GROUP]: "Nhóm khách hàng",
  [ApiApplyTo.BIRTHDAY]: "Khách hàng có sinh nhật",
  [ApiApplyTo.CARD_TIER]: "Khách hàng có hạng thẻ",
};

function toFilterOptions<T extends string>(
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return (Object.entries(labels) as Array<[T, string]>).map(
    ([value, label]) => ({ value, label }),
  );
}

export const PROMOTION_TYPE_FILTER_OPTIONS = toFilterOptions(
  PROMOTION_TYPE_LABELS_VI,
);
export const PROMOTION_STATUS_FILTER_OPTIONS = toFilterOptions(
  PROMOTION_STATUS_LABELS_VI,
);
export const PROMOTION_APPLY_TO_FILTER_OPTIONS = toFilterOptions(
  PROMOTION_APPLY_TO_LABELS_VI,
);

/** Đối tượng áp dụng khuyến mãi. */
export enum PromotionApplyTo {
  ALL_CUSTOMERS = "ALL_CUSTOMERS",
  CUSTOMER_GROUP = "CUSTOMER_GROUP",
  HAS_BIRTHDAY = "HAS_BIRTHDAY",
  HAS_CARD_TIER = "HAS_CARD_TIER",
}

/** Hình thức khuyến mãi (5 loại — khớp menu "Thêm mới"). */
export enum PromotionForm {
  INVOICE_DISCOUNT = "INVOICE_DISCOUNT",
  PRODUCT_DISCOUNT = "PRODUCT_DISCOUNT",
  TIERED_DISCOUNT = "TIERED_DISCOUNT",
  GIFT = "GIFT",
  BUY_M_GET_N = "BUY_M_GET_N",
}

/**
 * Trạng thái theo dõi chương trình — **dùng thẳng enum của API**, đúng 2 giá trị,
 * khớp radio FR-010 và `promotion_status_enum` phía DB.
 *
 * Bản cũ khai 3 giá trị cục bộ (`TRACKING | PAUSED | ENDED`); `ENDED` không phải
 * trạng thái lưu mà là suy ra ở client (`TRACKING` + `endDate` đã qua) — xem
 * `docs/26-promotion-design.md` §10.1 và `ProgramsTable.statusLabel`. Giữ 3 giá
 * trị nghĩa là bộ lọc gửi lên API một giá trị nó không hiểu.
 */
export { ApiStatus as PromotionStatus };

interface Option<T extends string> {
  value: T;
  label: string;
}

export const PROMOTION_APPLY_TO_OPTIONS: Option<PromotionApplyTo>[] = [
  { value: PromotionApplyTo.ALL_CUSTOMERS, label: "Tất cả khách hàng" },
  // { value: PromotionApplyTo.CUSTOMER_GROUP, label: "Nhóm khách hàng" },
  { value: PromotionApplyTo.HAS_BIRTHDAY, label: "Khách hàng có sinh nhật" },
  { value: PromotionApplyTo.HAS_CARD_TIER, label: "Khách hàng có hạng thẻ" },
];

export const PROMOTION_FORM_OPTIONS: Option<PromotionForm>[] = [
  { value: PromotionForm.INVOICE_DISCOUNT, label: "Giảm giá hóa đơn" },
  { value: PromotionForm.PRODUCT_DISCOUNT, label: "Giảm giá hàng hóa" },
  { value: PromotionForm.TIERED_DISCOUNT, label: "Giảm giá theo mức" },
  { value: PromotionForm.GIFT, label: "Tặng hàng hóa" },
  { value: PromotionForm.BUY_M_GET_N, label: "Mua m tặng n" },
];

/** Radio trạng thái của form Sửa (FR-010) — chỉ 2 lựa chọn lưu được. */
export const PROMOTION_STATUS_OPTIONS: Option<ApiStatus>[] = [
  { value: ApiStatus.TRACKING, label: PROMOTION_STATUS_LABELS_VI[ApiStatus.TRACKING] },
  { value: ApiStatus.STOPPED, label: PROMOTION_STATUS_LABELS_VI[ApiStatus.STOPPED] },
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
