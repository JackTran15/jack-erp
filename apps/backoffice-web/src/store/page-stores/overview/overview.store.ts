import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_ROW2_CASH_FLOW,
  DEFAULT_ROW2_REVENUE,
  DEFAULT_ROW3_LEFT,
  DEFAULT_ROW3_RIGHT,
} from "./overview.constant";
import type { OverviewState } from "./overview.interface";

/**
 * Nguồn sự thật duy nhất cho lựa chọn của từng widget trang Tổng quan.
 * Dropdown ở header widget đọc/ghi trực tiếp; modal "Tùy chọn" làm việc trên bản
 * nháp cục bộ rồi commit vào đây khi bấm "Đồng ý" → hai nơi luôn khớp.
 *
 * Chỉ chứa state UI. Dữ liệu chart đi qua TanStack Query.
 */
export const useOverviewStore = create<OverviewState>()(
  persist(
    (set) => ({
      row2Revenue: DEFAULT_ROW2_REVENUE,
      row2CashFlow: DEFAULT_ROW2_CASH_FLOW,
      row3Left: DEFAULT_ROW3_LEFT,
      row3Right: DEFAULT_ROW3_RIGHT,
      actions: {
        setRow2Revenue: (patch) =>
          set((s) => ({ row2Revenue: { ...s.row2Revenue, ...patch } })),
        setRow2CashFlow: (patch) =>
          set((s) => ({ row2CashFlow: { ...s.row2CashFlow, ...patch } })),
        setRow3Left: (patch) =>
          set((s) => ({ row3Left: { ...s.row3Left, ...patch } })),
        setRow3Right: (patch) =>
          set((s) => ({ row3Right: { ...s.row3Right, ...patch } })),
      },
    }),
    {
      name: "bo-overview-widgets",
      // Lựa chọn widget là sticky UI pref → giữ qua reload; `actions` không lưu.
      partialize: (state) => ({
        row2Revenue: state.row2Revenue,
        row2CashFlow: state.row2CashFlow,
        row3Left: state.row3Left,
        row3Right: state.row3Right,
      }),
    },
  ),
);

export const useOverviewActions = () => useOverviewStore((s) => s.actions);
