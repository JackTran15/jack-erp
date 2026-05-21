import { useCallback } from "react";

import type { PromoMenuOption } from "@erp/pos/constants/checkout.constant";
import { promoOptionLabel } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import type { VoucherFormResult } from "@erp/pos/dtos/voucher.dto";
import { usePosCheckoutPromotionStore } from "@erp/pos/stores/page-stores/checkout/checkout-promotion.store";
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
  const appliedPromotion = usePosCheckoutPromotionStore(
    (s) => s.appliedPromotion,
  );
  const setAppliedPromotion = usePosCheckoutPromotionStore(
    (s) => s.setAppliedPromotion,
  );

  const applyPromotion = useCallback(
    (promotion: PromotionItem | null) => {
      setAppliedPromotion(promotion);
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(
          promotion
            ? `Đã áp dụng ${promotion.name}.`
            : "Đã bỏ chương trình khuyến mãi.",
        );
    },
    [setAppliedPromotion],
  );

  const pickPromoOption = useCallback((option: PromoMenuOption) => {
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(`Đã chọn ${promoOptionLabel(option)}.`);
  }, []);

  const searchVoucher = useCallback((code: string) => {
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(`Đang tìm mã ưu đãi ${code}.`);
  }, []);

  const applyVoucher = useCallback((result: VoucherFormResult) => {
    const code = result.voucherCode || result.voucherId;
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(
        code ? `Đã áp dụng voucher ${code}.` : "Đã áp dụng voucher.",
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
