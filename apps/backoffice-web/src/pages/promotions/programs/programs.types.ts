/** Đối tượng áp dụng khuyến mãi. */
export type PromotionApplyTo =
  | "ALL_CUSTOMERS"
  | "CUSTOMER_GROUP"
  | "SPECIFIC_CUSTOMER";

/** Hình thức khuyến mãi (5 loại — khớp menu "Thêm mới"). */
export type PromotionForm =
  | "INVOICE_DISCOUNT"
  | "PRODUCT_DISCOUNT"
  | "TIERED_DISCOUNT"
  | "GIFT"
  | "BUY_M_GET_N";

/** Trạng thái theo dõi chương trình. */
export type PromotionStatus = "TRACKING" | "PAUSED" | "ENDED";

/** Một dòng trong danh sách chương trình khuyến mãi. */
export interface PromotionProgramRow {
  id: string;
  name: string;
  /** ISO date yyyy-MM-dd; có thể trống. */
  startDate?: string;
  /** ISO date yyyy-MM-dd; có thể trống. */
  endDate?: string;
  applyTo: PromotionApplyTo;
  form: PromotionForm;
  description?: string;
  status: PromotionStatus;
}
