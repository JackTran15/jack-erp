import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReportBackendKey,
  getReportBackendSource,
  getReportTableConfig,
} from "../../../../constants/reports/report-type.constant";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import {
  fetchReportColumns,
  mapHeadersToTableConfig,
} from "../_api/invoice-report.api";
import { fetchInventoryReportColumns } from "../_api/inventory-report-v2.api";
import { fetchDebtReportColumns } from "../_api/debt-report.api";
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
  const setConfig = useTableStore((s) => s.setConfig);
  const columnsActions = useTableStore((s) => s.columnsActions);

  const backendKey = getReportBackendKey(reportType);
  const backendSource = getReportBackendSource(reportType);
  const { template, isLoading: templateLoading } = useReportColumnTemplate();

  const { data: columnsResult } = useQuery({
    queryKey: ["report-columns", backendSource, backendKey, groupBy],
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
      return fetchReportColumns(backendKey as string);
    },
    enabled: Boolean(backendKey),
  });

  useEffect(() => {
    if (columnsResult && columnsResult.columns.length > 0) {
      // Chờ template load xong để tránh set config 2 lần (giật cột).
      if (templateLoading) return;
      setConfig(mapHeadersToTableConfig(columnsResult));
      if (template?.columns?.length) {
        const merged = mergeTemplateColumnsState(
          template.columns,
          columnsResult.columns.map((h) => h.col),
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
