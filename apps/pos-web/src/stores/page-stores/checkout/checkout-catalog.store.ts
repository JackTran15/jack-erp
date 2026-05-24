import { create } from "zustand";

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

/**
 * UI state cho catalog (toolbar + filter + collapse). Dữ liệu catalog (rows /
 * loading / error) đã chuyển sang React Query (`useCatalogQuery`), store này
 * chỉ giữ state thao tác phía client — không gọi service.
 */
interface PosCheckoutCatalogState {
  toolbar: ToolbarState;
  catalogQuery: string;
  catalogGroup: string | undefined;
  catalogCollapsed: boolean;

  setToolbar: (value: Updater<ToolbarState>) => void;
  setCatalogQuery: (value: Updater<string>) => void;
  setCatalogGroup: (value: Updater<string | undefined>) => void;
  setCatalogCollapsed: (value: Updater<boolean>) => void;
}

export const usePosCheckoutCatalogStore = create<PosCheckoutCatalogState>()(
  (set) => ({
    toolbar: initialToolbar(),
    catalogQuery: "",
    catalogGroup: undefined,
    catalogCollapsed: false,

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
  }),
);
