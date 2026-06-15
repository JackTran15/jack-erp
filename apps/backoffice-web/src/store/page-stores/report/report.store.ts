import { createStore, type StoreApi } from "zustand";
import { resolvePeriodRange, type PeriodPreset } from "@erp/ui";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import type {
  ReportInitialState,
  ReportState,
} from "./report.interface";

export type ReportStoreApi = StoreApi<ReportState>;

export function createReportStore(
  initialState: ReportInitialState,
): ReportStoreApi {
  return createStore<ReportState>((set) => ({
    ...initialState,

    actions: {
      // Đổi report type → xóa appliedRequest (data cũ) để chờ áp dụng lại; columns tự fetch theo type.
      setReportType: (reportType) => set({ reportType, appliedRequest: null }),

      setFilterValue: (line, value) =>
        set((s) => {
          const filters = { ...s.filters, [line]: value };
          // Đổi kỳ báo cáo (preset khác "custom") -> tự cập nhật khoảng ngày.
          if (
            line === REPORT_FILTERS_LINE.REPORT_PERIOD &&
            value !== "custom"
          ) {
            const range = resolvePeriodRange(value as PeriodPreset);
            filters[REPORT_FILTERS_LINE.RANGE_DATE] = {
              fromDate: range.from,
              toDate: range.to,
            };
          }
          // eslint-disable-next-line no-console
          console.log("[report-filter] change", {
            filters,
            columnFilters: s.columnFilters,
          });
          return { filters };
        }),

      setColumnFilter: (columnId, patch) =>
        set((s) => {
          const existing = s.columnFilters[columnId] ?? { operator: "", value: "" };
          const columnFilters = {
            ...s.columnFilters,
            [columnId]: { ...existing, ...patch },
          };
          // eslint-disable-next-line no-console
          console.log("[report-filter] change", { filters: s.filters, columnFilters });
          return { columnFilters };
        }),

      // Chốt filter hiện tại → appliedRequest (table sẽ fetch data theo snapshot này).
      applyFilters: () =>
        set((s) => ({
          appliedRequest: {
            reportType: s.reportType,
            filters: s.filters,
            columnFilters: s.columnFilters,
          },
        })),

      resetFilters: () =>
        set({
          reportType: initialState.reportType,
          filters: {},
          columnFilters: {},
          appliedRequest: null,
        }),

      reset: () => set({ ...initialState }),
    },
  }));
}
