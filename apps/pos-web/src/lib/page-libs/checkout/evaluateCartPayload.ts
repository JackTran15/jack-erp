import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import type { EvaluateCartLineBody } from "@erp/pos/dtos/promotion.dto";
import { lineDiscountAmount } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";

/**
 * Giỏ hàng → body dòng cho `POST /v2/promotions/evaluate`. Tách riêng khỏi
 * `use-checkout-promotion-preview.ts` để dùng lại được ở lời gọi evaluate()
 * chủ động (T-09-03/T-09-04's `useCheckoutExcludePreview`) mà không lặp logic
 * map — hai chỗ khác đi thì hai con số preview sẽ lệch nhau.
 *
 * Chỉ dòng **mua** đi vào engine. Dòng trả (`isReturnCredit`, tab đổi trả theo
 * hóa đơn) giữ CTKM của hóa đơn gốc qua snapshot, không đánh giá lại — BE
 * (`CheckoutReturnService`) cũng chỉ evaluate dòng OUT (2026092102 ADR-01).
 * `returnCart` của đổi trả nhanh là mảng riêng nên không bao giờ tới đây.
 *
 * `manualLineDiscount` là **số tiền** giảm tay của dòng, cho cả `percent` lẫn
 * `amount`: draft/phiếu đổi gửi `{type, value}` và BE quy ra tiền rồi bơm vào
 * engine (`evaluate-promotion.step.ts`), nên preview phải gửi đúng số đó để
 * khớp — trước đây bỏ trống với `percent` và preview lệch BE (A-10).
 */
export function buildEvaluateCartLines(cart: CartLine[]): EvaluateCartLineBody[] {
  return cart
    .filter((line) => !line.isReturnCredit)
    .map((line) => {
      const manual = lineDiscountAmount(line);
      return {
        lineId: line.lineId,
        itemId: line.itemId,
        quantity: line.qty,
        unitPrice: line.unitPrice,
        ...(manual > 0 ? { manualLineDiscount: manual } : {}),
      };
    });
}
