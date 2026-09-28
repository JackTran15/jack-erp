import { resolvePeriodRange } from "@erp/ui";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EINVOICE_DEFAULT_PAGE_SIZE, EINVOICE_STORE_KEY } from "./einvoice.constant";
import type { EInvoiceState } from "./einvoice.interface";

const initialRange = resolvePeriodRange("this_year");

/**
 * State UI của trang "Phát hành hóa đơn điện tử". Dữ liệu lưới đi qua TanStack
 * Query — store chỉ giữ lựa chọn của người dùng.
 */
export const useEInvoiceStore = create<EInvoiceState>()(
  persist(
    (set, get) => ({
      tab: "unissued",
      period: { preset: "this_year", ...initialRange },
      applied: { ...initialRange },
      page: 1,
      pageSize: EINVOICE_DEFAULT_PAGE_SIZE,
      checkedIds: [],
      editingId: null,
      detailId: null,
      actions: {
        setTab: (tab) => set({ tab, page: 1, checkedIds: [] }),
        setPeriod: (period) => set({ period }),
        applyFilter: () => {
          const { period } = get();
          set({ applied: { from: period.from, to: period.to }, page: 1, checkedIds: [] });
        },
        setPage: (page) => set({ page }),
        setPageSize: (pageSize) => set({ pageSize, page: 1 }),
        toggleChecked: (id) =>
          set((state) => ({
            checkedIds: state.checkedIds.includes(id)
              ? state.checkedIds.filter((item) => item !== id)
              : [...state.checkedIds, id],
          })),
        setCheckedIds: (checkedIds) => set({ checkedIds }),
        setEditingId: (editingId) => set({ editingId }),
        setDetailId: (detailId) => set({ detailId }),
      },
    }),
    {
      name: EINVOICE_STORE_KEY,
      // Chỉ giữ sticky UI pref qua reload.
      partialize: (state) => ({ pageSize: state.pageSize }),
    },
  ),
);

export const useEInvoiceActions = () => useEInvoiceStore((s) => s.actions);
