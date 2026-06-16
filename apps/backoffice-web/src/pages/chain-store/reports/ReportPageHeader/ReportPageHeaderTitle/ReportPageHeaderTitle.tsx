import { getReportTypeLabel } from "../../../../../constants/reports/report-type.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";

export function ReportPageHeaderTitle() {
  const reportType = useReportStore((s) => s.reportType);
  const title = getReportTypeLabel(reportType);

  return (
    <div className="mx-auto flex flex-col items-center gap-1 text-center text-[#2B3164]">
      <h1 className="text-[20px] font-medium uppercase leading-tight">
        {title}
      </h1>
    </div>
  );
}
