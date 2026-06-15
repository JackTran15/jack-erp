import { ReportPageHeaderTitle } from "./ReportPageHeaderTitle/ReportPageHeaderTitle";
import { ReportPageHeaderFilter } from "./ReportPageHeaderFilter/ReportPageHeaderFilter";
import { ReportPageToolbar } from "./ReportPageToolbar/ReportPageToolbar";

export function ReportPageHeader() {
  return (
    <div className="shrink-0">
      {/* Band 1: Chọn báo cáo (trái) + tiêu đề (giữa) */}
      <div className="relative flex items-center py-2">
        <button
          type="button"
          className="absolute left-0 h-[30px] rounded-[3px] bg-[#2B3164] px-3.5 text-[13px] text-white hover:bg-[#3A4178]"
        >
          Chọn báo cáo
        </button>
        <ReportPageHeaderTitle />
      </div>

      {/* Band 2: bộ lọc (trái) + nhóm action (phải) */}
      <div className="flex items-center justify-between py-2">
        <ReportPageHeaderFilter />
        <ReportPageToolbar />
      </div>
    </div>
  );
}
