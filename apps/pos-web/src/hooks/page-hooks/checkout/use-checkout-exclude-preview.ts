import { useCallback } from "react";

import { promotionService } from "@erp/pos/services/promotion.service";
import { buildEvaluateCartLines } from "@erp/pos/lib/page-libs/checkout/evaluateCartPayload";
import type { EvaluateCartResponse } from "@erp/pos/dtos/promotion.dto";
import {
  selectCustomerDraft,
  selectPromotionDraft,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * Gọi `evaluate` thật (không debounce, một lần, chủ động) để biết CHÍNH XÁC
 * "còn phải thu" sẽ ra bao nhiêu NẾU thêm một/nhiều id vào `excludedProgramIds`
 * — dùng để nêu số tiền trong hộp xác nhận loại trừ (T-09-03/T-09-04, AC-34).
 *
 * Không suy ra "sau khi bỏ CTKM X thì cộng lại X.discountAmount" ở client:
 * loại một CTKM có thể giải phóng tài nguyên nó đang chiếm (slot quà/giảm giá
 * hoá đơn/dòng hàng) cho một CTKM KHÁC trước đó bị RESOURCE_TAKEN — số tiền
 * "sau" khi đó không phải subtotal cũng không phải "trước + discountAmount
 * của CTKM bị loại", mà server mới biết chắc (bắt được sống khi live-test
 * 12/08/2026: loại 1 CTKM invoice-discount làm 1 CTKM khác — trước đó thua
 * cùng tài nguyên — tự áp thay, số tiền sau khác hẳn ước tính client).
 */
export function useCheckoutExcludePreview() {
  const cart = usePosCheckoutSessionStore(selectPurchaseCart);
  const customer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );
  const selectedProgramIds = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).selectedProgramIds,
  );
  const excludedProgramIds = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).excludedProgramIds,
  );

  /**
   * `extraExcludedIds` = id sắp bị loại thêm (chưa ghi vào store — hộp xác
   * nhận phải hỏi TRƯỚC khi ghi). Trả `null` khi gọi lỗi — caller tự quyết
   * định hiện gì (thường là hộp xác nhận không kèm số tiền, xem
   * `PROMOTION_EXCLUDE_CONFIRM.messageNoAmount`), không throw để một lời gọi
   * preview hỏng không chặn được luồng loại trừ (cùng tinh thần ADR-06).
   */
  const previewExcluding = useCallback(
    async (extraExcludedIds: string[]): Promise<EvaluateCartResponse | null> => {
      try {
        const customerId = customer?.id;
        const nextExcluded = [...new Set([...excludedProgramIds, ...extraExcludedIds])];
        return await promotionService.evaluate({
          lines: buildEvaluateCartLines(cart),
          ...(customerId ? { customerId } : {}),
          ...(selectedProgramIds.length > 0 ? { selectedProgramIds } : {}),
          ...(nextExcluded.length > 0 ? { excludedProgramIds: nextExcluded } : {}),
        });
      } catch {
        return null;
      }
    },
    [cart, customer, selectedProgramIds, excludedProgramIds],
  );

  return { previewExcluding };
}
