import { create } from "zustand";

interface PosFastStockTransferUiState {
  pageError: string;
  isProcessDialogOpen: boolean;
  isDiscrepancyDialogOpen: boolean;

  setPageError: (message: string) => void;
  clearPageError: () => void;

  openProcessDialog: () => void;
  closeProcessDialog: () => void;
  openDiscrepancyDialog: () => void;
  closeDiscrepancyDialog: () => void;
  resetDialogs: () => void;
}

export const usePosFastStockTransferUiStore = create<PosFastStockTransferUiState>()(
  (set) => ({
    pageError: "",
    isProcessDialogOpen: false,
    isDiscrepancyDialogOpen: false,

    setPageError: (message) => set({ pageError: message }),
    clearPageError: () => set({ pageError: "" }),

    openProcessDialog: () => set({ isProcessDialogOpen: true }),
    closeProcessDialog: () => set({ isProcessDialogOpen: false }),
    openDiscrepancyDialog: () => set({ isDiscrepancyDialogOpen: true }),
    closeDiscrepancyDialog: () => set({ isDiscrepancyDialogOpen: false }),
    resetDialogs: () =>
      set({ isProcessDialogOpen: false, isDiscrepancyDialogOpen: false }),
  }),
);
