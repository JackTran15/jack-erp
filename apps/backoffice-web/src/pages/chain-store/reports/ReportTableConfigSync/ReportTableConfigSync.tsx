import { useEffect } from "react";
import { getReportTableConfig } from "../../../../constants/reports/report-type.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";

// Cầu nối report store -> table store: đổi report type / loại view thì cập nhật table config tại chỗ
// (cột/sort/trang reset theo config mới) — không remount provider nên popover vẫn mở.
export function ReportTableConfigSync() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const setConfig = useTableStore((s) => s.setConfig);

  useEffect(() => {
    setConfig(getReportTableConfig(reportType, branch));
  }, [reportType, branch, setConfig]);

  return null;
}
