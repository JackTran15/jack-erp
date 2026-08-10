import { PromotionProgramType } from "@erp/shared-interfaces";

/**
 * Chỉ 2 field cần cho breakdown khi in — dùng chung cho cả `AppliedProgram`
 * (preview lúc thanh toán) lẫn snapshot `invoice_checkout_promotions` đã lưu
 * (in lại, T-08-01), vì cả hai đều mang đủ 2 field này.
 */
export interface PromotionAmount {
  type: PromotionProgramType;
  discountAmount: number;
}

export interface PromotionPrintBuckets {
  /** "KM theo mặt hàng" — undefined khi tổng = 0, khớp cách amountRow() ẩn dòng. */
  itemDiscountTotal?: number;
  /** "KM theo hoá đơn" — undefined khi tổng = 0. */
  invoiceDiscountTotal?: number;
}

/**
 * Gom danh sách CTKM đã áp thành 2 nhóm cho hóa đơn in: `INVOICE_DISCOUNT` →
 * "KM theo hoá đơn"; `ITEM_DISCOUNT`/`TIERED_DISCOUNT`/`BUY_M_GET_N` → "KM
 * theo mặt hàng" (cả ba đều phân bổ qua `lineDiscounts[]`, xác nhận từ 5 file
 * strategy backend). `GIFT_ITEM` loại khỏi cả hai — luôn `discountAmount: 0`,
 * quà đã có dòng riêng trên hóa đơn (`gifts[]`), không phải một khoản tiền.
 */
export function groupPromotionsForPrint(
  programs: PromotionAmount[],
): PromotionPrintBuckets {
  let itemDiscountTotal = 0;
  let invoiceDiscountTotal = 0;

  for (const program of programs) {
    if (program.type === PromotionProgramType.INVOICE_DISCOUNT) {
      invoiceDiscountTotal += program.discountAmount;
    } else if (program.type !== PromotionProgramType.GIFT_ITEM) {
      itemDiscountTotal += program.discountAmount;
    }
  }

  return {
    itemDiscountTotal: itemDiscountTotal !== 0 ? itemDiscountTotal : undefined,
    invoiceDiscountTotal: invoiceDiscountTotal !== 0 ? invoiceDiscountTotal : undefined,
  };
}
