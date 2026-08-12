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
  /**
   * Id các CTKM tùy chọn (`auto_apply=false`) thu ngân đã tick — không gồm
   * CTKM `auto_apply=true` (server tự áp, không cần chọn). Nguồn sự thật cho
   * số tiền là `promotionPreview` (đọc qua `selectPromotionPreview`), không
   * phải mảng này — mảng chỉ là lựa chọn gửi lên `evaluate`/`checkout`.
   */
  selectedProgramIds: string[];
  /**
   * Id các CTKM thu ngân đã bỏ hẳn (UOW-09/ADR-07, đóng A-13) — kể cả CTKM
   * `auto_apply=true` server đã tự áp. Nguồn sự thật cho số tiền vẫn là
   * `promotionPreview`, không phải mảng này.
   */
  excludedProgramIds: string[];
  applyPromotion: (promotion: PromotionItem | null) => void;
  /**
   * Bật/tắt loại trừ một CTKM. Gọi khi thu ngân untick dòng "Đã áp dụng"
   * (loại) hoặc tick lại dòng "Đã bỏ áp dụng" (khôi phục) trong dialog, hoặc
   * bấm X ở dòng tổng "Khuyến mại" (T-09-04). Xác nhận trước khi gọi (khi
   * loại) là việc của UI gọi hàm này, không phải của hàm này.
   */
  toggleExcludeProgram: (programId: string) => void;
  /**
   * Bỏ hẳn nhiều CTKM cùng lúc — nút X ở dòng tổng "Khuyến mại" (T-09-04),
   * loại toàn bộ `appliedPrograms` hiện tại chứ không phải một dòng. Gộp
   * thêm vào `excludedProgramIds` hiện có, không ghi đè.
   */
  excludeAllApplied: (programIds: string[]) => void;
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
 * Promotion + voucher handlers — đọc ui store và phát announce. Danh sách
 * CTKM hiển thị trong dialog đến từ `promotionPreview` (T-02-02), không phải
 * từ đây — hook này chỉ giữ lựa chọn tùy chọn của thu ngân.
 */
export function useCheckoutPromotion(): UseCheckoutPromotionResult {
  const selectedProgramIds = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).selectedProgramIds,
  );
  const excludedProgramIds = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).excludedProgramIds,
  );
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );

  const applyPromotion = useCallback(
    (promotion: PromotionItem | null) => {
      // Dialog vẫn chọn-1 (chưa multi-select) — mảng chỉ có 0 hoặc 1 phần tử
      // cho tới khi có UoW cho phép chọn nhiều CTKM tùy chọn cùng lúc.
      updateDraftSlice("promotion", (p) => ({
        ...p,
        selectedProgramIds: promotion ? [promotion.id] : [],
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

  // T-09-03/T-09-04 — bật/tắt loại trừ. Tick lại (khôi phục) và loại lần đầu
  // dùng cùng một hàm — cả hai chỉ là "id có trong mảng hay không", khác biệt
  // duy nhất (có cần hộp xác nhận hay không) đã được UI xử lý trước khi gọi.
  const toggleExcludeProgram = useCallback(
    (programId: string) => {
      updateDraftSlice("promotion", (p) => {
        const isExcluded = p.excludedProgramIds.includes(programId);
        return {
          ...p,
          excludedProgramIds: isExcluded
            ? p.excludedProgramIds.filter((id) => id !== programId)
            : [...p.excludedProgramIds, programId],
        };
      });
    },
    [updateDraftSlice],
  );

  const excludeAllApplied = useCallback(
    (programIds: string[]) => {
      updateDraftSlice("promotion", (p) => ({
        ...p,
        excludedProgramIds: [...new Set([...p.excludedProgramIds, ...programIds])],
      }));
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
    selectedProgramIds,
    excludedProgramIds,
    applyPromotion,
    toggleExcludeProgram,
    excludeAllApplied,
    pickPromoOption,
    searchVoucher,
    applyVoucher,
    setRedeemedPoints,
    clearRedeemedPoints,
  };
}
