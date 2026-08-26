import { createStore, type StoreApi } from "zustand";
import { resolvePeriodRange, type PeriodPreset } from "@erp/ui";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import { STORE_TYPE } from "../../../constants/store.constant";
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
    detailInvoice: null,
    drillDown: null,

    actions: {
      // Đổi report type → columns tự fetch theo type. Chain: tự áp dụng ngay
      // (snapshot mới) để fill data không cần bấm nút; single: xóa để chờ áp dụng.
      setReportType: (reportType) =>
        set((s) => ({
          reportType,
          appliedRequest:
            s.branch === STORE_TYPE.CHAIN
              ? { reportType, filters: s.filters, columnFilters: s.columnFilters }
              : null,
        })),

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
          // Đổi cửa hàng -> kho đã chọn có thể thuộc cửa hàng khác: reset.
          if (line === REPORT_FILTERS_LINE.STORE) {
            filters[REPORT_FILTERS_LINE.WAREHOUSE] = "";
          }
          // Đổi cửa hàng xuất -> nếu trùng cửa hàng nhận đang chọn, reset về "Tất cả".
          if (
            line === REPORT_FILTERS_LINE.SOURCE_STORE &&
            s.filters[REPORT_FILTERS_LINE.RECEIVING_STORE] === value
          ) {
            filters[REPORT_FILTERS_LINE.RECEIVING_STORE] = "";
          }
          return { filters };
        }),

      setColumnFilter: (columnId, patch) =>
        set((s) => {
          const existing = s.columnFilters[columnId] ?? { operator: "", value: "" };
          const columnFilters = {
            ...s.columnFilters,
            [columnId]: { ...existing, ...patch },
          };
          return { columnFilters };
        }),

      // Áp dụng filter cột (dòng đầu bảng) ngay, không cần bấm "Lấy dữ liệu".
      // Chỉ chạy khi report đã tải (appliedRequest != null) và columnFilters đổi so với snapshot.
      commitColumnFilters: () =>
        set((s) => {
          if (!s.appliedRequest) return {};
          if (s.appliedRequest.columnFilters === s.columnFilters) return {}; // chưa đổi -> bỏ qua
          return {
            appliedRequest: { ...s.appliedRequest, columnFilters: s.columnFilters },
            reloadNonce: s.reloadNonce + 1,
          };
        }),

      // Bộ cột đổi theo "Thống kê theo" hoặc chế độ xem, và cột biến mất thì ô
      // lọc của nó cũng biến mất — nhưng giá trị đã gõ thì không. Không dọn ở
      // đây, nó thành bộ lọc VÔ HÌNH vẫn đang chạy: lưới trả 0 dòng mà người
      // dùng không thấy chỗ nào để xoá.
      pruneColumnFilters: (knownColumns) =>
        set((s) => {
          const known = new Set(knownColumns);
          const kept = Object.keys(s.columnFilters).filter((c) => known.has(c));
          if (kept.length === Object.keys(s.columnFilters).length) return {};
          const columnFilters = Object.fromEntries(
            kept.map((c) => [c, s.columnFilters[c]]),
          );
          return {
            columnFilters,
            appliedRequest: s.appliedRequest
              ? { ...s.appliedRequest, columnFilters }
              : s.appliedRequest,
            reloadNonce: s.reloadNonce + 1,
          };
        }),

      // Chốt filter hiện tại → appliedRequest (table sẽ fetch data theo snapshot này).
      // reloadNonce tăng để ép refetch ngay cả khi filter không đổi (mỗi click = 1 lần gọi API).
      applyFilters: () =>
        set((s) => ({
          appliedRequest: {
            reportType: s.reportType,
            filters: s.filters,
            columnFilters: s.columnFilters,
          },
          reloadNonce: s.reloadNonce + 1,
        })),

      resetFilters: () =>
        set({
          reportType: initialState.reportType,
          filters: {},
          columnFilters: {},
          appliedRequest: null,
        }),

      setDetailInvoice: (target) => set({ detailInvoice: target }),

      setDrillDown: (drillDown) => set({ drillDown }),

      // Xoá cả drillDown: đổi report type khi dialog đang mở sẽ để lại một
      // dialog mồ côi trỏ vào báo cáo cũ.
      reset: () =>
        set({ ...initialState, detailInvoice: null, drillDown: null }),
    },
  }));
}
