

import { getReportTypeLabel } from "../../../../../constants/reports/report-type.constant";
import { STORE_TYPE } from "../../../../../constants/store.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";

export function ReportPageHeaderTitle() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const title = getReportTypeLabel(reportType);
  const description =
    branch === STORE_TYPE.CHAIN ? "Xem theo chuỗi cửa hàng" : "Xem theo chi nhánh";

  return (
    <div className="mx-auto flex flex-col items-center gap-1 text-center text-primary">
      <h1 className="text-lg font-semibold uppercase tracking-wide leading-tight">
        {title}
      </h1>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
