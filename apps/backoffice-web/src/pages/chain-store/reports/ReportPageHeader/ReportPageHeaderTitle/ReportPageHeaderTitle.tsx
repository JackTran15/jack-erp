

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
    <div className="mx-auto flex flex-col items-center gap-1 text-center text-[#2B3164]">
      <h1 className="text-[20px] font-medium uppercase leading-tight">
        {title}
      </h1>
      <p className="text-[13px] font-normal">{description}</p>
    </div>
  );
}
