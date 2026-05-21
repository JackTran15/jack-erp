import { create } from "zustand";

import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";

/**
 * Phần khuyến mãi đã áp cho đơn hiện tại. Danh sách KM khả dụng lấy từ React
 * Query (chỗ khác); store này chỉ giữ KM đang áp + reset theo session.
 */
interface PosCheckoutPromotionState {
  appliedPromotion: PromotionItem | null;
  setAppliedPromotion: (promotion: PromotionItem | null) => void;
  resetPromotionDraft: () => void;
}

export const usePosCheckoutPromotionStore = create<PosCheckoutPromotionState>()(
  (set) => ({
    appliedPromotion: null,
    setAppliedPromotion: (promotion) => set({ appliedPromotion: promotion }),
    resetPromotionDraft: () => set({ appliedPromotion: null }),
  }),
);
