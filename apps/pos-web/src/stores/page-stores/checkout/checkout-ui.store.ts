import { create } from "zustand";
import type { PosProductKind } from "@erp/pos/types/catalog.type";

type Updater<T> = T | ((prev: T) => T);

/** Mục tiêu mở dialog chọn biến thể: product id (kind=PRODUCT) hoặc item id (kind=ITEM). */
export interface VariantDialogTarget {
  id: string;
  kind: PosProductKind;
  /** Tên hiển thị tạm trên header trong lúc fetch chi tiết. */
  title: string;
}

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

const DEFAULT_ANNOUNCEMENT_DURATION_MS = 3_000;

let announcementTimer: ReturnType<typeof setTimeout> | null = null;

interface PosCheckoutUiState {
  announcement: string;
  cancelInvoiceOpen: boolean;
  oversellOpen: boolean;
  createCustomerSucceeded: boolean;
  cartError: string;
  /**
   * Cờ + state của các dialog khách hàng — transient theo "view hiện tại", KHÔNG
   * theo tab (đổi tab thì mọi dialog đang mở phải đóng). Tách khỏi `selectedCustomer`
   * (per-tab, nằm trong session draft).
   */
  customerFieldError: string;
  createCustomerOpen: boolean;
  createDefaultQuery: string;
  customerDetailOpen: boolean;
  /**
   * Dialog chọn biến thể (mở khi click product card / chọn từ search). Transient
   * theo view hiện tại như các dialog khác. `variantDialogTarget` giữ lại sau khi
   * đóng để animation thoát mượt; chỉ `variantDialogOpen` điều khiển hiển thị.
   */
  variantDialogOpen: boolean;
  variantDialogTarget: VariantDialogTarget | null;
  pendingQtyFocusLineId: string | null;
  /**
   * Tăng counter để yêu cầu ProductSearchInput focus + select. Component
   * subscribe và focus self trong useEffect khi giá trị thay đổi. Pattern
   * "signal counter" tránh state boolean phải reset thủ công.
   */
  productSearchFocusSeq: number;

  /**
   * Right-click context menu cho dòng trong InvoiceLineItemTable. Lưu lineId
   * + toạ độ viewport (clientX/clientY). null = đóng. Mỗi lúc chỉ 1 menu open.
   */
  lineContextMenu: { lineId: string; x: number; y: number } | null;
  /** lineId của dòng đang mở modal "Giá bán gần nhất". */
  recentPriceDialogLineId: string | null;
  /** lineId của dòng đang mở modal "Khuyến mại khác". */
  lineDiscountDialogLineId: string | null;
  /** lineId của dòng đang bật inline note editor. */
  editingNoteLineId: string | null;

  setAnnouncement: (message: string, durationMs?: number) => void;
  clearAnnouncement: () => void;

  openCancelInvoice: () => void;
  closeCancelInvoice: () => void;

  openOversell: () => void;
  closeOversell: () => void;

  setCreateCustomerSucceeded: (next: boolean) => void;

  setCustomerFieldError: (value: Updater<string>) => void;
  setCreateCustomerOpen: (value: Updater<boolean>) => void;
  setCreateDefaultQuery: (value: Updater<string>) => void;
  setCustomerDetailOpen: (value: Updater<boolean>) => void;

  openVariantDialog: (target: VariantDialogTarget) => void;
  closeVariantDialog: () => void;

  setCartError: (message: string) => void;
  clearCartError: () => void;

  setPendingQtyFocusLineId: (lineId: string | null) => void;
  clearPendingQtyFocusLineId: () => void;

  requestProductSearchFocus: () => void;

  openLineContextMenu: (lineId: string, x: number, y: number) => void;
  closeLineContextMenu: () => void;
  openRecentPriceDialog: (lineId: string) => void;
  closeRecentPriceDialog: () => void;
  openLineDiscountDialog: (lineId: string) => void;
  closeLineDiscountDialog: () => void;
  startEditLineNote: (lineId: string) => void;
  stopEditLineNote: () => void;

  resetCheckoutUiDraft: () => void;
}

export const usePosCheckoutUiStore = create<PosCheckoutUiState>()((set) => ({
  announcement: "",
  cancelInvoiceOpen: false,
  oversellOpen: false,
  createCustomerSucceeded: false,
  cartError: "",
  customerFieldError: "",
  createCustomerOpen: false,
  createDefaultQuery: "",
  customerDetailOpen: false,
  variantDialogOpen: false,
  variantDialogTarget: null,
  pendingQtyFocusLineId: null,
  productSearchFocusSeq: 0,
  lineContextMenu: null,
  recentPriceDialogLineId: null,
  lineDiscountDialogLineId: null,
  editingNoteLineId: null,

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

  setCustomerFieldError: (value) =>
    set((s) => ({ customerFieldError: apply(s.customerFieldError, value) })),
  setCreateCustomerOpen: (value) =>
    set((s) => ({ createCustomerOpen: apply(s.createCustomerOpen, value) })),
  setCreateDefaultQuery: (value) =>
    set((s) => ({ createDefaultQuery: apply(s.createDefaultQuery, value) })),
  setCustomerDetailOpen: (value) =>
    set((s) => ({ customerDetailOpen: apply(s.customerDetailOpen, value) })),

  openVariantDialog: (target) =>
    set({ variantDialogOpen: true, variantDialogTarget: target }),
  closeVariantDialog: () => set({ variantDialogOpen: false }),

  setCartError: (message) => set({ cartError: message }),
  clearCartError: () => set({ cartError: "" }),

  setPendingQtyFocusLineId: (lineId) => set({ pendingQtyFocusLineId: lineId }),
  clearPendingQtyFocusLineId: () => set({ pendingQtyFocusLineId: null }),

  requestProductSearchFocus: () =>
    set((state) => ({ productSearchFocusSeq: state.productSearchFocusSeq + 1 })),

  openLineContextMenu: (lineId, x, y) =>
    set({ lineContextMenu: { lineId, x, y } }),
  closeLineContextMenu: () => set({ lineContextMenu: null }),
  openRecentPriceDialog: (lineId) =>
    set({ recentPriceDialogLineId: lineId, lineContextMenu: null }),
  closeRecentPriceDialog: () => set({ recentPriceDialogLineId: null }),
  openLineDiscountDialog: (lineId) =>
    set({ lineDiscountDialogLineId: lineId, lineContextMenu: null }),
  closeLineDiscountDialog: () => set({ lineDiscountDialogLineId: null }),
  startEditLineNote: (lineId) =>
    set({ editingNoteLineId: lineId, lineContextMenu: null }),
  stopEditLineNote: () => set({ editingNoteLineId: null }),

  resetCheckoutUiDraft: () =>
    set({
      cancelInvoiceOpen: false,
      oversellOpen: false,
      cartError: "",
      customerFieldError: "",
      createCustomerOpen: false,
      createDefaultQuery: "",
      customerDetailOpen: false,
      variantDialogOpen: false,
      variantDialogTarget: null,
      lineContextMenu: null,
      recentPriceDialogLineId: null,
      lineDiscountDialogLineId: null,
      editingNoteLineId: null,
    }),
}));
