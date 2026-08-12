import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import type { EvaluateCartLineBody } from "@erp/pos/dtos/promotion.dto";

/**
 * Giỏ hàng → body dòng cho `POST /v2/promotions/evaluate`. Tách riêng khỏi
 * `use-checkout-promotion-preview.ts` để dùng lại được ở lời gọi evaluate()
 * chủ động (T-09-03/T-09-04's `useCheckoutExcludePreview`) mà không lặp logic
 * map — hai chỗ khác đi thì hai con số preview sẽ lệch nhau.
 */
export function buildEvaluateCartLines(cart: CartLine[]): EvaluateCartLineBody[] {
  return cart.map((line) => ({
    lineId: line.lineId,
    itemId: line.itemId,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    ...(line.lineDiscount?.type === "amount"
      ? { manualLineDiscount: line.lineDiscount.value }
      : {}),
  }));
}
