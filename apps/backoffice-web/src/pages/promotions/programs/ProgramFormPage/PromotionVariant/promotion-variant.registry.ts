import type { ComponentType } from "react";
import { PromotionForm } from "../../programs.constants";
import type { ProgramFormState } from "../../program-form.types";
import { PromotionInvoiceDiscount } from "./PromotionInvoiceDiscount/PromotionInvoiceDiscount";
import { PromotionProductDiscount } from "./PromotionProductDiscount/PromotionProductDiscount";
import { PromotionTieredDiscount } from "./PromotionTieredDiscount/PromotionTieredDiscount";
import { PromotionGift } from "./PromotionGift/PromotionGift";
import { PromotionBuyGet } from "./PromotionBuyGet/PromotionBuyGet";

export interface PromotionVariantProps {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

/**
 * Bảng tra hình thức khuyến mại → component form.
 * Cả 5 variant nhận cùng `{ form, onChange }`, nên chỗ nối là một bảng tra
 * chứ không phải chuỗi `if`.
 */
export const PROMOTION_VARIANTS: Record<
  PromotionForm,
  ComponentType<PromotionVariantProps>
> = {
  [PromotionForm.INVOICE_DISCOUNT]: PromotionInvoiceDiscount,
  [PromotionForm.PRODUCT_DISCOUNT]: PromotionProductDiscount,
  [PromotionForm.TIERED_DISCOUNT]: PromotionTieredDiscount,
  [PromotionForm.GIFT]: PromotionGift,
  [PromotionForm.BUY_M_GET_N]: PromotionBuyGet,
};

/** `?type=` chỉ hợp lệ khi khớp một giá trị `PromotionForm`. */
export function parsePromotionForm(
  raw: string | null,
): PromotionForm | undefined {
  if (!raw) return undefined;
  return (Object.values(PromotionForm) as string[]).includes(raw)
    ? (raw as PromotionForm)
    : undefined;
}
