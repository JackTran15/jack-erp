import { useCallback } from "react";

import type { PromoMenuOption } from "@erp/pos/constants/checkout.constant";
import { CHECKOUT_ANNOUNCEMENTS } from "@erp/pos/constants/checkout-messages.constant";
import { promoOptionLabel } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import type { VoucherFormResult } from "@erp/pos/dtos/voucher.dto";
import {
  selectPromotionDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutPromotionResult {
  appliedPromotion: PromotionItem | null;
  applyPromotion: (promotion: PromotionItem | null) => void;
  pickPromoOption: (option: PromoMenuOption) => void;
  searchVoucher: (code: string) => void;
  applyVoucher: (result: VoucherFormResult) => void;
  /**
   * Ghi `pointsRedeemed` vào draft local. Hằng nội bộ — không gọi BE
   * `/invoices/:id/redeem-points` ở đây; BE chỉ được gọi ở bước finalize
   * (`useCheckoutActions.finalizeCheckoutAndPrint`) sau khi đã có invoiceId.
   */
  setRedeemedPoints: (points: number) => void;
  /** Reset `pointsRedeemed` về 0 (đồng nghĩa bỏ áp dụng điểm). */
  clearRedeemedPoints: () => void;
}

/**
 * Promotion + voucher handlers — đọc ui store và phát announce. Hiện
 * `promotions` list ở Page là static `[]` nên không expose từ đây.
 */
export function useCheckoutPromotion(): UseCheckoutPromotionResult {
  const appliedPromotion = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).appliedPromotion,
  );
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );

  const applyPromotion = useCallback(
    (promotion: PromotionItem | null) => {
      updateDraftSlice("promotion", (p) => ({
        ...p,
        appliedPromotion: promotion,
      }));
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(
          promotion
            ? CHECKOUT_ANNOUNCEMENTS.promotionApplied(promotion.name)
            : CHECKOUT_ANNOUNCEMENTS.PROMOTION_CLEARED,
        );
    },
    [updateDraftSlice],
  );

  const pickPromoOption = useCallback((option: PromoMenuOption) => {
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(
        CHECKOUT_ANNOUNCEMENTS.promoOptionPicked(promoOptionLabel(option)),
      );
  }, []);

  const searchVoucher = useCallback((code: string) => {
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(CHECKOUT_ANNOUNCEMENTS.searchingVoucher(code));
  }, []);

  const applyVoucher = useCallback(
    (result: VoucherFormResult) => {
      // Lưu voucher vào draft local — BE chưa có endpoint apply-voucher, nên
      // số liệu trên grand total không đổi; chip hiển thị ở right pane lấy
      // từ slice này.
      updateDraftSlice("promotion", (p) => ({ ...p, appliedVoucher: result }));
      const code = result.voucherCode || result.voucherId;
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(
          code
            ? CHECKOUT_ANNOUNCEMENTS.voucherAppliedCode(code)
            : CHECKOUT_ANNOUNCEMENTS.VOUCHER_APPLIED,
        );
    },
    [updateDraftSlice],
  );

  const setRedeemedPoints = useCallback(
    (points: number) => {
      const next = Math.max(0, Math.floor(points));
      updateDraftSlice("promotion", (p) => ({ ...p, pointsRedeemed: next }));
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(
          next > 0
            ? CHECKOUT_ANNOUNCEMENTS.pointsApplied(next)
            : CHECKOUT_ANNOUNCEMENTS.POINTS_CLEARED,
        );
    },
    [updateDraftSlice],
  );

  const clearRedeemedPoints = useCallback(() => {
    updateDraftSlice("promotion", (p) => ({ ...p, pointsRedeemed: 0 }));
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(CHECKOUT_ANNOUNCEMENTS.POINTS_CLEARED);
  }, [updateDraftSlice]);

  return {
    appliedPromotion,
    applyPromotion,
    pickPromoOption,
    searchVoucher,
    applyVoucher,
    setRedeemedPoints,
    clearRedeemedPoints,
  };
}
