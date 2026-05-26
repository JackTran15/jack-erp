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
      updateDraftSlice("promotion", () => ({ appliedPromotion: promotion }));
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

  const applyVoucher = useCallback((result: VoucherFormResult) => {
    const code = result.voucherCode || result.voucherId;
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(
        code
          ? CHECKOUT_ANNOUNCEMENTS.voucherAppliedCode(code)
          : CHECKOUT_ANNOUNCEMENTS.VOUCHER_APPLIED,
      );
  }, []);

  return {
    appliedPromotion,
    applyPromotion,
    pickPromoOption,
    searchVoucher,
    applyVoucher,
  };
}
