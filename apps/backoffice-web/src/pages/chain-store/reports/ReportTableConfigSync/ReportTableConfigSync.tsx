import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PROFIT_REPORT_KEYS } from "@erp/shared-interfaces";
import {
  getReportBackendKey,
  getReportBackendSource,
  getReportTableConfig,
} from "../../../../constants/reports/report-type.constant";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import { STORE_TYPE } from "../../../../constants/store.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import {
  fetchReportColumns,
  mapHeadersToTableConfig,
} from "../_api/invoice-report.api";
import { fetchInventoryReportColumns } from "../_api/inventory-report-v2.api";
import { fetchDebtReportColumns } from "../_api/debt-report.api";
import { fetchProfitReportColumns } from "../_api/profit-report.api";
import {
  mergeTemplateColumnsState,
  useReportColumnTemplate,
} from "../_api/report-template.api";

// Cột: ưu tiên backend theo report type; nếu BE không hỗ trợ / trả rỗng → fallback registry config.
// Template "Hiển thị cột" đã lưu (nếu có) đè order/visibility/pinning lên catalog.
export function ReportTableConfigSync() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  // Chỉ báo cáo #4 (supplier-debts-detail-by-document-and-product) có bộ cột
  // phụ thuộc filter "Thống kê theo" — các báo cáo khác bỏ qua giá trị này.
  const groupBy = useReportStore(
    (s) => s.filters[REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE],
  );
  // profit-by-item có bộ cột phụ thuộc "Thống kê theo" (tái dùng STATISTIC_BY
  // — cùng filter line revenue-by-item đang dùng); báo cáo lợi nhuận khác bỏ qua.
  const statBy = useReportStore((s) => s.filters[REPORT_FILTERS_LINE.STATISTIC_BY]);
  const setConfig = useTableStore((s) => s.setConfig);
  const columnsActions = useTableStore((s) => s.columnsActions);

  const backendKey = getReportBackendKey(reportType);
  const backendSource = getReportBackendSource(reportType);
  const { template, isLoading: templateLoading } = useReportColumnTemplate();

  const { data: columnsResult } = useQuery({
    queryKey: ["report-columns", backendSource, backendKey, groupBy, statBy],
    queryFn: () => {
      if (backendSource === "inventory") {
        return fetchInventoryReportColumns(backendKey as string);
      }
      if (backendSource === "debt") {
        return fetchDebtReportColumns(
          backendKey as string,
          groupBy as "item" | "productTemplate" | undefined,
        );
      }
      if (backendSource === "profit") {
        return fetchProfitReportColumns(
          backendKey as string,
          statBy as "item" | "parent" | "group" | undefined,
        );
      }
      return fetchReportColumns(backendKey as string);
    },
    enabled: Boolean(backendKey),
  });

  useEffect(() => {
    if (columnsResult && columnsResult.columns.length > 0) {
      // Chờ template load xong để tránh set config 2 lần (giật cột).
      if (templateLoading) return;
      // profit-by-item "Vị trí" là dữ liệu 1-chi-nhánh — ở Chuỗi cửa hàng (gộp
      // nhiều/mọi cửa hàng vào 1 dòng) không có 1 vị trí duy nhất, bỏ hẳn cột
      // này dù BE (không biết ngữ cảnh chuỗi/1-chi-nhánh) vẫn trả về.
      const isChainProfitByItemLocation =
        backendSource === "profit" &&
        backendKey === PROFIT_REPORT_KEYS.PROFIT_BY_ITEM &&
        branch === STORE_TYPE.CHAIN;
      const effectiveColumnsResult = isChainProfitByItemLocation
        ? { ...columnsResult, columns: columnsResult.columns.filter((h) => h.col !== "location") }
        : columnsResult;
      setConfig(mapHeadersToTableConfig(effectiveColumnsResult));
      if (template?.columns?.length) {
        const merged = mergeTemplateColumnsState(
          template.columns,
          effectiveColumnsResult.columns.map((h) => h.col),
        );
        columnsActions.setOrder(merged.order);
        columnsActions.setVisibility(merged.visibility);
        columnsActions.setPinning(merged.pinning);
      }
    } else {
      setConfig(getReportTableConfig(reportType, branch));
    }
  }, [
    columnsResult,
    template,
    templateLoading,
    reportType,
    branch,
    setConfig,
    columnsActions,
  ]);

  return null;
}
