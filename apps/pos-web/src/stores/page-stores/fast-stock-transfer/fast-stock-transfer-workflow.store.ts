import { create } from "zustand";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import {
  EMPTY_FAST_STOCK_TRANSFER_FILTERS,
  EMPTY_FAST_STOCK_TRANSFER_TOOLBAR_DRAFT,
  reconcileLocationOnProductChange,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-pickers";
import type {
  FastStockTransferFilters,
  FastStockTransferToolbarDraft,
} from "@erp/pos/interfaces/fast-stock-transfer.interface";
import { TempWarehouseDirection } from "@erp/shared-interfaces";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

interface PosFastStockTransferWorkflowState {
  direction: TempWarehouseDirection;
  filters: FastStockTransferFilters;
  toolbarDraft: FastStockTransferToolbarDraft;
  transferSelectedByLineId: Record<string, boolean>;
  hiddenLineIds: ReadonlyArray<string>;
  editingRowId: string | null;
  editableDraft: FastStockTransferToolbarDraft | null;
  pollSessionId: string | null;

  setDirection: (direction: TempWarehouseDirection) => void;
  setFilter: <K extends keyof FastStockTransferFilters>(
    key: K,
    value: FastStockTransferFilters[K],
  ) => void;
  setFilters: (value: Updater<FastStockTransferFilters>) => void;

  setToolbarCarrier: (carrier: FastStockTransferToolbarDraft["carrier"]) => void;
  setToolbarProduct: (product: FastStockTransferToolbarDraft["product"]) => void;
  setToolbarLocation: (
    location: FastStockTransferToolbarDraft["location"],
  ) => void;
  resetToolbarAfterAdd: (keepCarrier: FastStockTransferToolbarDraft["carrier"]) => void;
  refreshToolbarProductFromCatalog: (catalogLines: ReadonlyArray<PosCatalogLine>) => void;

  setEditDraftCarrier: (carrier: FastStockTransferToolbarDraft["carrier"]) => void;
  setEditDraftProduct: (product: FastStockTransferToolbarDraft["product"]) => void;
  setEditDraftLocation: (
    location: FastStockTransferToolbarDraft["location"],
  ) => void;
  startEditingRow: (
    rowId: string,
    draft: FastStockTransferToolbarDraft,
  ) => void;
  clearEditingRow: () => void;

  setTransferSelected: (lineId: string, selected: boolean) => void;
  clearTransferSelection: () => void;
  remapTransferSelection: (fromId: string, toId: string) => void;

  addHiddenLineIds: (ids: ReadonlyArray<string>) => void;
  pruneHiddenLineIds: (activeIds: ReadonlySet<string>) => void;

  setPollSessionId: (sessionId: string | null) => void;
  resetWorkflow: () => void;
}

export const usePosFastStockTransferWorkflowStore =
  create<PosFastStockTransferWorkflowState>()((set) => ({
    direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    filters: { ...EMPTY_FAST_STOCK_TRANSFER_FILTERS },
    toolbarDraft: { ...EMPTY_FAST_STOCK_TRANSFER_TOOLBAR_DRAFT },
    transferSelectedByLineId: {},
    hiddenLineIds: [],
    editingRowId: null,
    editableDraft: null,
    pollSessionId: null,

    setDirection: (direction) =>
      set((state) => ({
        direction,
        editingRowId: null,
        editableDraft: null,
        toolbarDraft: {
          ...EMPTY_FAST_STOCK_TRANSFER_TOOLBAR_DRAFT,
          carrier: state.toolbarDraft.carrier,
        },
      })),

    setFilter: (key, value) =>
      set((state) => {
        const next = { ...state.filters, [key]: value };
        if (key === "showRowsNeedingReview") {
          return { filters: next, editingRowId: null, editableDraft: null };
        }
        return { filters: next };
      }),

    setFilters: (value) =>
      set((state) => ({ filters: apply(state.filters, value) })),

    setToolbarCarrier: (carrier) =>
      set((state) => ({
        toolbarDraft: { ...state.toolbarDraft, carrier },
      })),

    setToolbarProduct: (product) =>
      set((state) => ({
        toolbarDraft: {
          ...state.toolbarDraft,
          product,
          location: reconcileLocationOnProductChange(
            product,
            state.toolbarDraft.location,
          ),
        },
      })),

    setToolbarLocation: (location) =>
      set((state) => ({
        toolbarDraft: { ...state.toolbarDraft, location },
      })),

    resetToolbarAfterAdd: (keepCarrier) =>
      set({
        toolbarDraft: {
          ...EMPTY_FAST_STOCK_TRANSFER_TOOLBAR_DRAFT,
          carrier: keepCarrier,
        },
      }),

    refreshToolbarProductFromCatalog: (catalogLines) =>
      set((state) => {
        const { product } = state.toolbarDraft;
        if (!product) return state;
        const refreshed = catalogLines.find((p) => p.itemId === product.itemId);
        if (!refreshed) {
          return {
            toolbarDraft: {
              ...state.toolbarDraft,
              product: null,
              location: null,
            },
          };
        }
        return {
          toolbarDraft: {
            ...state.toolbarDraft,
            product: refreshed,
            location: reconcileLocationOnProductChange(
              refreshed,
              state.toolbarDraft.location,
            ),
          },
        };
      }),

    setEditDraftCarrier: (carrier) =>
      set((state) =>
        state.editableDraft
          ? { editableDraft: { ...state.editableDraft, carrier } }
          : state,
      ),

    setEditDraftProduct: (product) =>
      set((state) =>
        state.editableDraft
          ? {
              editableDraft: {
                ...state.editableDraft,
                product,
                location: reconcileLocationOnProductChange(
                  product,
                  state.editableDraft.location,
                ),
              },
            }
          : state,
      ),

    setEditDraftLocation: (location) =>
      set((state) =>
        state.editableDraft
          ? { editableDraft: { ...state.editableDraft, location } }
          : state,
      ),

    startEditingRow: (rowId, draft) =>
      set({ editingRowId: rowId, editableDraft: draft }),

    clearEditingRow: () => set({ editingRowId: null, editableDraft: null }),

    setTransferSelected: (lineId, selected) =>
      set((state) => ({
        transferSelectedByLineId: {
          ...state.transferSelectedByLineId,
          [lineId]: selected,
        },
      })),

    clearTransferSelection: () => set({ transferSelectedByLineId: {} }),

    remapTransferSelection: (fromId, toId) =>
      set((state) => {
        if (!state.transferSelectedByLineId[fromId]) return state;
        const next = { ...state.transferSelectedByLineId };
        next[toId] = true;
        delete next[fromId];
        return { transferSelectedByLineId: next };
      }),

    addHiddenLineIds: (ids) =>
      set((state) => {
        const setIds = new Set(state.hiddenLineIds);
        for (const id of ids) setIds.add(id);
        return { hiddenLineIds: [...setIds] };
      }),

    pruneHiddenLineIds: (activeIds) =>
      set((state) => {
        const next = state.hiddenLineIds.filter((id) => activeIds.has(id));
        return next.length === state.hiddenLineIds.length
          ? state
          : { hiddenLineIds: next };
      }),

    setPollSessionId: (pollSessionId) => set({ pollSessionId }),

    resetWorkflow: () =>
      set({
        transferSelectedByLineId: {},
        hiddenLineIds: [],
        editingRowId: null,
        editableDraft: null,
        toolbarDraft: { ...EMPTY_FAST_STOCK_TRANSFER_TOOLBAR_DRAFT },
      }),
  }));
