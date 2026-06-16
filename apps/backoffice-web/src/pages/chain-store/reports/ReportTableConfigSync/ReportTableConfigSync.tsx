import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReportBackendKey,
  getReportTableConfig,
} from "../../../../constants/reports/report-type.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import {
  fetchReportColumns,
  mapHeadersToTableConfig,
} from "../_api/invoice-report.api";

// Cột: ưu tiên backend theo report type; nếu BE không hỗ trợ / trả rỗng → fallback registry config.
export function ReportTableConfigSync() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const setConfig = useTableStore((s) => s.setConfig);

  const backendKey = getReportBackendKey(reportType);

  const { data: headers } = useQuery({
    queryKey: ["report-columns", backendKey],
    queryFn: () => fetchReportColumns(backendKey as string),
    enabled: Boolean(backendKey),
  });

  useEffect(() => {
    if (headers && headers.length > 0) {
      setConfig(mapHeadersToTableConfig(headers));
    } else {
      setConfig(getReportTableConfig(reportType, branch));
    }
  }, [headers, reportType, branch, setConfig]);

  return null;
}
