import { create } from "zustand";

import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import type { PriceBook } from "@erp/pos/hooks/page-hooks/checkout/use-price-books";
import type { Salesperson } from "@erp/pos/hooks/page-hooks/checkout/use-salespersons";

const DEFAULT_ANNOUNCEMENT_DURATION_MS = 3_000;

let announcementTimer: ReturnType<typeof setTimeout> | null = null;

interface PosCheckoutUiState {
  announcement: string;
  cancelInvoiceOpen: boolean;
  oversellOpen: boolean;
  createCustomerSucceeded: boolean;
  cartError: string;
  pendingQtyFocusLineId: string | null;
  /**
   * Tăng counter để yêu cầu ProductSearchInput focus + select. Component
   * subscribe và focus self trong useEffect khi giá trị thay đổi. Pattern
   * "signal counter" tránh state boolean phải reset thủ công.
   */
  productSearchFocusSeq: number;
  appliedPromotion: PromotionItem | null;
  selectedSalesperson: Salesperson | null;
  selectedPriceBook: PriceBook | null;

  setAnnouncement: (message: string, durationMs?: number) => void;
  clearAnnouncement: () => void;

  openCancelInvoice: () => void;
  closeCancelInvoice: () => void;

  openOversell: () => void;
  closeOversell: () => void;

  setCreateCustomerSucceeded: (next: boolean) => void;

  setCartError: (message: string) => void;
  clearCartError: () => void;

  setPendingQtyFocusLineId: (lineId: string | null) => void;
  clearPendingQtyFocusLineId: () => void;

  requestProductSearchFocus: () => void;

  setAppliedPromotion: (promotion: PromotionItem | null) => void;

  setSelectedSalesperson: (next: Salesperson | null) => void;
  setSelectedPriceBook: (next: PriceBook | null) => void;

  resetCheckoutUiDraft: () => void;
}

export const usePosCheckoutUiStore = create<PosCheckoutUiState>()((set) => ({
  announcement: "",
  cancelInvoiceOpen: false,
  oversellOpen: false,
  createCustomerSucceeded: false,
  cartError: "",
  pendingQtyFocusLineId: null,
  productSearchFocusSeq: 0,
  appliedPromotion: null,
  selectedSalesperson: null,
  selectedPriceBook: null,

  setAnnouncement: (message, durationMs = DEFAULT_ANNOUNCEMENT_DURATION_MS) => {
    if (announcementTimer !== null) {
      clearTimeout(announcementTimer);
      announcementTimer = null;
    }
    set({ announcement: message });
    if (message.length === 0) return;
    announcementTimer = setTimeout(() => {
      announcementTimer = null;
      set({ announcement: "" });
    }, durationMs);
  },
  clearAnnouncement: () => {
    if (announcementTimer !== null) {
      clearTimeout(announcementTimer);
      announcementTimer = null;
    }
    set({ announcement: "" });
  },

  openCancelInvoice: () => set({ cancelInvoiceOpen: true }),
  closeCancelInvoice: () => set({ cancelInvoiceOpen: false }),

  openOversell: () => set({ oversellOpen: true }),
  closeOversell: () => set({ oversellOpen: false }),

  setCreateCustomerSucceeded: (next) => set({ createCustomerSucceeded: next }),

  setCartError: (message) => set({ cartError: message }),
  clearCartError: () => set({ cartError: "" }),

  setPendingQtyFocusLineId: (lineId) => set({ pendingQtyFocusLineId: lineId }),
  clearPendingQtyFocusLineId: () => set({ pendingQtyFocusLineId: null }),

  requestProductSearchFocus: () =>
    set((state) => ({ productSearchFocusSeq: state.productSearchFocusSeq + 1 })),

  setAppliedPromotion: (promotion) => set({ appliedPromotion: promotion }),

  setSelectedSalesperson: (next) => set({ selectedSalesperson: next }),
  setSelectedPriceBook: (next) => set({ selectedPriceBook: next }),

  resetCheckoutUiDraft: () =>
    set({
      cancelInvoiceOpen: false,
      oversellOpen: false,
      cartError: "",
      appliedPromotion: null,
    }),
}));
