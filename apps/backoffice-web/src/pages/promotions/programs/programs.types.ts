import {
  PromotionApplyTo,
  PromotionForm,
  PromotionStatus,
} from "./programs.constants";

export { PromotionApplyTo, PromotionForm, PromotionStatus };

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
