import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PAPER_CONFIG } from "./barcode-print-settings.constant";
import type { BarcodePrintSettingsState } from "./barcode-print-settings.interface";

export const useBarcodePrintSettingsStore = create<BarcodePrintSettingsState>()(
  persist(
    (set) => ({
      paper: DEFAULT_PAPER_CONFIG,
      setPaper: (patch) =>
        set((state) => ({ paper: { ...state.paper, ...patch } })),
      resetPaper: () => set({ paper: DEFAULT_PAPER_CONFIG }),
    }),
    {
      name: "bo-barcode-print-settings",
      partialize: (state) => ({
        paper: state.paper,
      }),
    },
  ),
);
