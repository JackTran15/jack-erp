import { useEffect, useRef } from "react";

import { promotionService } from "@erp/pos/services/promotion.service";
import { buildEvaluateCartLines } from "@erp/pos/lib/page-libs/checkout/evaluateCartPayload";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import {
  selectCheckoutVariant,
  selectCustomerDraft,
  selectPromotionDraft,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

/**
 * Khoảng chờ gộp lời gọi. Thu ngân quét mã liên tục, mỗi lần quét là một lần
 * giỏ hàng đổi — không gộp thì mỗi đơn 20 dòng sẽ nã 20 lời gọi.
 */
const DEBOUNCE_MS = 300;

/**
 * Gọi `POST /v2/promotions/evaluate` mỗi khi giỏ hàng / khách / CTKM đã chọn
 * đổi, rồi ghi kết quả vào slice `promotionPreview` của draft đang mở.
 *
 * Ba tính chất không phải trang trí:
 *
 * 1. **Debounce** — gộp một tràng quét mã thành ít lời gọi.
 * 2. **Abort** — lời gọi cũ bị huỷ khi có lời gọi mới. Thiếu bước này thì một
 *    phản hồi chậm của giỏ hàng cũ có thể về sau và ghi đè số của giỏ mới, tức
 *    là hiện sai tiền cho khách.
 * 3. **Không bao giờ ném lỗi ra ngoài** — hỏng thì rơi vào `unavailable`, thu
 *    ngân vẫn bấm Thu tiền được vì server mới là nơi chốt số (ADR-06 của
 *    `checkout-saga`).
 *
 * Chỉ chạy ở luồng SALE: đơn trả/đổi có bài toán hoàn khuyến mại riêng, ngoài
 * phạm vi feature này.
 */
export function useCheckoutPromotionPreview(): void {
  const cart = usePosCheckoutSessionStore(selectPurchaseCart);
  const variant = usePosCheckoutSessionStore(selectCheckoutVariant);
  const customer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );
  const selectedProgramIds = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).selectedProgramIds,
  );
  const excludedProgramIds = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).excludedProgramIds,
  );
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );
  // Bump từ nút "Thử lại" ở dialog Chương trình khuyến mãi khi preview
  // `unavailable` — không tự nó đổi dữ liệu gì, chỉ ép effect chạy lại.
  const retrySeq = usePosCheckoutUiStore((s) => s.promotionPreviewRetrySeq);

  const abortRef = useRef<AbortController | null>(null);

  // Chỉ những trường thực sự đổi kết quả mới nằm trong khoá — dùng nguyên
  // mảng `cart` sẽ chạy lại mỗi lần render vì tham chiếu đổi liên tục.
  const lines = buildEvaluateCartLines(cart);
  const cartKey = JSON.stringify(lines);
  const selectedProgramIdsKey = JSON.stringify(selectedProgramIds);
  const excludedProgramIdsKey = JSON.stringify(excludedProgramIds);
  const customerId = customer?.id;
  const isSale = variant === CheckoutVariantEnum.SALE;

  useEffect(() => {
    abortRef.current?.abort();

    if (!isSale) {
      // Đơn trả/đổi: bài toán hoàn khuyến mại riêng, ngoài phạm vi hook này.
      updateDraftSlice("promotionPreview", () => ({
        status: "idle",
        data: null,
        error: null,
      }));
      return;
    }
    // Giỏ rỗng vẫn gọi evaluate (BE chấp nhận `lines: []`) — dialog "Chương
    // trình khuyến mãi" phải load được danh sách CTKM (đa số sẽ hiện "Chưa đủ
    // điều kiện") ngay cả khi thu ngân chưa quét hàng nào, không phải chờ dòng
    // đầu tiên.

    const controller = new AbortController();
    abortRef.current = controller;

    updateDraftSlice("promotionPreview", (prev) => ({
      ...prev,
      status: "loading",
      error: null,
    }));

    const timer = setTimeout(() => {
      promotionService
        .evaluate(
          {
            lines,
            ...(customerId ? { customerId } : {}),
            ...(selectedProgramIds.length > 0 ? { selectedProgramIds } : {}),
            ...(excludedProgramIds.length > 0 ? { excludedProgramIds } : {}),
          },
          { signal: controller.signal },
        )
        .then((data) => {
          if (controller.signal.aborted) return;
          updateDraftSlice("promotionPreview", () => ({
            status: "ready",
            data,
            error: null,
          }));
        })
        .catch((err: unknown) => {
          // Huỷ chủ động không phải lỗi — chỉ nghĩa là đã có giỏ hàng mới hơn.
          if (controller.signal.aborted) return;
          updateDraftSlice("promotionPreview", () => ({
            status: "unavailable",
            data: null,
            error: err instanceof Error ? err.message : String(err),
          }));
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cartKey,
    customerId,
    isSale,
    updateDraftSlice,
    retrySeq,
    selectedProgramIdsKey,
    excludedProgramIdsKey,
  ]);
}
