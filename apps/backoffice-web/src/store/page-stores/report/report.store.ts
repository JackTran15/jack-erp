import { createStore, type StoreApi } from "zustand";
import { resolvePeriodRange, type PeriodPreset } from "@erp/ui";
import {
  REPORT_FILTERS_LINE,
  REPORT_FILTERS_LINE_METADATA,
} from "../../../constants/reports/report-filters.constant";
import { getReportFormLines } from "../../../constants/reports/report-type.constant";
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
      setReportType: (reportType) => set({ reportType }),

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

      resetFilters: () =>
        set({
          reportType: initialState.reportType,
          filters: {},
          columnFilters: {},
        }),

      reset: () => set({ ...initialState }),
    },
  }));
}

// Gom giá trị đã chọn thành payload theo backendField (dùng khi submit / call api).
export function buildReportSubmitPayload(
  state: Pick<ReportState, "reportType" | "filters" | "branch">,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { reportType: state.reportType };
  for (const line of getReportFormLines(state.reportType, state.branch)) {
    const meta = REPORT_FILTERS_LINE_METADATA[line] as {
      backendField: string;
      backendField2?: string;
    };
    switch (line) {
      case REPORT_FILTERS_LINE.STORE: {
        const store = state.filters[REPORT_FILTERS_LINE.STORE];
        payload[meta.backendField] =
          !store || store.scope === "all" ? "all" : store.storeIds;
        break;
      }
      case REPORT_FILTERS_LINE.INVOICE_STATUS:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.INVOICE_STATUS] ?? [];
        break;
      case REPORT_FILTERS_LINE.STAT_DATE_TYPE:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.STAT_DATE_TYPE] ?? "";
        break;
      case REPORT_FILTERS_LINE.CASHIER:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.CASHIER] ?? "";
        break;
      case REPORT_FILTERS_LINE.SALESPERSON:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.SALESPERSON] ?? "";
        break;
      case REPORT_FILTERS_LINE.CUSTOMER:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.CUSTOMER] ?? "";
        break;
      case REPORT_FILTERS_LINE.REPORT_PERIOD:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.REPORT_PERIOD] ?? "";
        break;
      case REPORT_FILTERS_LINE.RANGE_DATE: {
        const range = state.filters[REPORT_FILTERS_LINE.RANGE_DATE];
        payload[meta.backendField] = range?.fromDate ?? "";
        if (meta.backendField2) payload[meta.backendField2] = range?.toDate ?? "";
        break;
      }
      case REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND:
        payload[meta.backendField] =
          state.filters[REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND] ?? false;
        break;
    }
  }
  return payload;
}
