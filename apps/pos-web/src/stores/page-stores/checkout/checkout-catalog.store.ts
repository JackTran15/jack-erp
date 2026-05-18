import { create } from "zustand";

import {
  fetchPosCatalog,
  type PosCatalogLine,
} from "@erp/pos/lib/page-libs/checkout/posCatalogApi";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

interface ToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
}

const initialToolbar = (): ToolbarState => ({
  query: "",
  qty: 1,
  splitLine: false,
});

interface PosCheckoutCatalogState {
  catalog: PosCatalogLine[];
  catalogLoading: boolean;
  catalogError: string;
  toolbar: ToolbarState;
  catalogQuery: string;
  catalogGroup: string | undefined;
  catalogCollapsed: boolean;

  setCatalog: (value: Updater<PosCatalogLine[]>) => void;
  setCatalogLoading: (value: Updater<boolean>) => void;
  setCatalogError: (value: Updater<string>) => void;

  setToolbar: (value: Updater<ToolbarState>) => void;
  setCatalogQuery: (value: Updater<string>) => void;
  setCatalogGroup: (value: Updater<string | undefined>) => void;
  setCatalogCollapsed: (value: Updater<boolean>) => void;

  loadCatalog: (branchId: string) => Promise<void>;
}

export const usePosCheckoutCatalogStore = create<PosCheckoutCatalogState>()(
  (set) => ({
    catalog: [],
    catalogLoading: true,
    catalogError: "",
    toolbar: initialToolbar(),
    catalogQuery: "",
    catalogGroup: undefined,
    catalogCollapsed: false,

    setCatalog: (value) =>
      set((state) => ({ catalog: apply(state.catalog, value) })),
    setCatalogLoading: (value) =>
      set((state) => ({ catalogLoading: apply(state.catalogLoading, value) })),
    setCatalogError: (value) =>
      set((state) => ({ catalogError: apply(state.catalogError, value) })),

    setToolbar: (value) =>
      set((state) => ({ toolbar: apply(state.toolbar, value) })),
    setCatalogQuery: (value) =>
      set((state) => ({ catalogQuery: apply(state.catalogQuery, value) })),
    setCatalogGroup: (value) =>
      set((state) => ({ catalogGroup: apply(state.catalogGroup, value) })),
    setCatalogCollapsed: (value) =>
      set((state) => ({
        catalogCollapsed: apply(state.catalogCollapsed, value),
      })),

    loadCatalog: async (branchId) => {
      set({ catalogError: "", catalogLoading: true });
      try {
        const rows = await fetchPosCatalog(branchId);
        set({ catalog: rows, catalogLoading: false });
      } catch (e) {
        set({
          catalog: [],
          catalogError:
            e instanceof Error
              ? `Không tải được tồn kho: ${e.message}`
              : "Không tải được tồn kho.",
          catalogLoading: false,
        });
      }
    },
  }),
);
