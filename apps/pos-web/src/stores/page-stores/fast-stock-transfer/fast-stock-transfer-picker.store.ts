import { create } from "zustand";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import {
  collectCarriersFromLines,
  collectProductsFromLines,
  listCarriersSorted,
  mergeCarriersById,
  mergeProductsByItemId,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/picker-cache";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";
import type {
  TempWarehouseLine,
  TempWarehousePublicUser,
} from "@erp/shared-interfaces";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

interface CarrierToolbarState {
  query: string;
}

interface ProductToolbarState {
  query: string;
}

const initialCarrierToolbar = (): CarrierToolbarState => ({ query: "" });
const initialProductToolbar = (): ProductToolbarState => ({ query: "" });

interface PosFastStockTransferPickerState {
  carriersById: Record<string, TempWarehousePublicUser>;
  carrierToolbar: CarrierToolbarState;

  productsByItemId: Record<string, PosCatalogLine>;
  catalogDirection: PosCatalogDirection;
  productToolbar: ProductToolbarState;

  setCarrierToolbar: (value: Updater<CarrierToolbarState>) => void;
  setProductToolbar: (value: Updater<ProductToolbarState>) => void;
  setCatalogDirection: (direction: PosCatalogDirection) => void;

  upsertCarriers: (
    users: ReadonlyArray<TempWarehousePublicUser | null | undefined>,
  ) => void;
  getCarrierById: (userId: string) => TempWarehousePublicUser | null;
  listCarriers: () => TempWarehousePublicUser[];

  upsertProducts: (
    products: ReadonlyArray<PosCatalogLine | null | undefined>,
  ) => void;
  findProduct: (itemId: string) => PosCatalogLine | null;
  clearProductCache: () => void;

  syncFromLines: (lines: ReadonlyArray<TempWarehouseLine>) => void;
}

export const usePosFastStockTransferPickerStore =
  create<PosFastStockTransferPickerState>()((set, get) => ({
    carriersById: {},
    carrierToolbar: initialCarrierToolbar(),

    productsByItemId: {},
    catalogDirection: "warehouse",
    productToolbar: initialProductToolbar(),

    setCarrierToolbar: (value) =>
      set((state) => ({
        carrierToolbar: apply(state.carrierToolbar, value),
      })),

    setProductToolbar: (value) =>
      set((state) => ({
        productToolbar: apply(state.productToolbar, value),
      })),

    setCatalogDirection: (direction) => set({ catalogDirection: direction }),

    upsertCarriers: (users) =>
      set((state) => ({
        carriersById: mergeCarriersById(state.carriersById, users),
      })),

    getCarrierById: (userId) => get().carriersById[userId] ?? null,

    listCarriers: () => listCarriersSorted(get().carriersById),

    upsertProducts: (products) =>
      set((state) => ({
        productsByItemId: mergeProductsByItemId(
          state.productsByItemId,
          products,
        ),
      })),

    findProduct: (itemId) => get().productsByItemId[itemId] ?? null,

    clearProductCache: () => set({ productsByItemId: {} }),

    syncFromLines: (lines) => {
      const carriers = collectCarriersFromLines(lines);
      const products = collectProductsFromLines(lines);
      set((state) => ({
        carriersById: mergeCarriersById(state.carriersById, carriers),
        productsByItemId: mergeProductsByItemId(
          state.productsByItemId,
          products,
        ),
      }));
    },
  }));
