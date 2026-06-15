import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReportBackendKey } from "../../../../constants/reports/report-type.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import {
  fetchReportColumns,
  mapHeadersToTableConfig,
} from "../_api/invoice-report.api";

const EMPTY_CONFIG = { columns: [] };

// Columns lấy từ API theo report type (reactive — fetch ngay khi đổi type) → nạp vào table store.
export function ReportTableConfigSync() {
  const reportType = useReportStore((s) => s.reportType);
  const setConfig = useTableStore((s) => s.setConfig);

  const backendKey = getReportBackendKey(reportType);

  const { data: headers } = useQuery({
    queryKey: ["report-columns", backendKey],
    queryFn: () => fetchReportColumns(backendKey as string),
    enabled: Boolean(backendKey),
  });

  useEffect(() => {
    setConfig(headers ? mapHeadersToTableConfig(headers) : EMPTY_CONFIG);
  }, [headers, setConfig]);

  return null;
}
