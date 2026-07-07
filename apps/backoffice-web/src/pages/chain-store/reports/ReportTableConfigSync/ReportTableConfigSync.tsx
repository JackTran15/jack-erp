import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReportBackendKey,
  getReportBackendSource,
  getReportTableConfig,
} from "../../../../constants/reports/report-type.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import {
  fetchReportColumns,
  mapHeadersToTableConfig,
} from "../_api/invoice-report.api";
import { fetchInventoryReportColumns } from "../_api/inventory-report-v2.api";
import {
  mergeTemplateColumnsState,
  useReportColumnTemplate,
} from "../_api/report-template.api";

// Cột: ưu tiên backend theo report type; nếu BE không hỗ trợ / trả rỗng → fallback registry config.
// Template "Hiển thị cột" đã lưu (nếu có) đè order/visibility/pinning lên catalog.
export function ReportTableConfigSync() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const setConfig = useTableStore((s) => s.setConfig);
  const columnsActions = useTableStore((s) => s.columnsActions);

  const backendKey = getReportBackendKey(reportType);
  const backendSource = getReportBackendSource(reportType);
  const { template, isLoading: templateLoading } = useReportColumnTemplate();

  const { data: columnsResult } = useQuery({
    queryKey: ["report-columns", backendSource, backendKey],
    queryFn: () =>
      backendSource === "inventory"
        ? fetchInventoryReportColumns(backendKey as string)
        : fetchReportColumns(backendKey as string),
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
