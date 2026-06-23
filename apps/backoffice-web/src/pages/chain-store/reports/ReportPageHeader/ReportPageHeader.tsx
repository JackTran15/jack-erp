import { ReportPageHeaderTitle } from "./ReportPageHeaderTitle/ReportPageHeaderTitle";
import { ReportPageHeaderFilter } from "./ReportPageHeaderFilter/ReportPageHeaderFilter";
import { ReportPageToolbar } from "./ReportPageToolbar/ReportPageToolbar";
import { ReportSelector } from "./ReportSelector/ReportSelector";

export function ReportPageHeader() {
  return (
    <div className="shrink-0">
      {/* Band 1: Chọn báo cáo (trái) + tiêu đề (giữa) */}
      <div className="relative flex items-center py-2">
        <ReportSelector />
        <ReportPageHeaderTitle />
      </div>

      {/* Band 2: bộ lọc (trái) + nhóm action (phải) */}
      <div className="flex items-center justify-between py-2 gap-2 flex-wrap">
        <ReportPageHeaderFilter />
        <ReportPageToolbar />
      </div>
    </div>
  );
}
