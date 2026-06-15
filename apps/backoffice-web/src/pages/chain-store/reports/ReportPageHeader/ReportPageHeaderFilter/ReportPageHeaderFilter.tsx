import { useQueryClient } from "@tanstack/react-query";
import { PERIOD_PRESET_OPTIONS } from "@erp/ui";
import { Filter } from "lucide-react";
import { REPORT_FILTERS_LINE } from "../../../../../constants/reports/report-filters.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";

const controlClass =
  "h-[30px] rounded-[3px] border border-[#D9D9DE] bg-white px-2 text-[13px] text-[#212121] outline-none";

export function ReportPageHeaderFilter() {
  const queryClient = useQueryClient();
  const period =
    useReportStore((s) => s.filters[REPORT_FILTERS_LINE.REPORT_PERIOD]) ?? "";
  const range = useReportStore(
    (s) => s.filters[REPORT_FILTERS_LINE.RANGE_DATE],
  ) ?? { fromDate: "", toDate: "" };
  const setFilterValue = useReportStore((s) => s.actions.setFilterValue);

  return (
    <div className="flex items-center gap-2">
      <select
        className={`${controlClass} w-[120px]`}
        value={period}
        onChange={(e) =>
          setFilterValue(REPORT_FILTERS_LINE.REPORT_PERIOD, e.target.value)
        }
      >
        <option value="">— Kỳ báo cáo —</option>
        {PERIOD_PRESET_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="text-[13px] text-[#5C5C66]">Từ ngày</label>
      <input
        type="date"
        className={`${controlClass} w-[140px]`}
        value={range.fromDate}
        onChange={(e) =>
          setFilterValue(REPORT_FILTERS_LINE.RANGE_DATE, {
            ...range,
            fromDate: e.target.value,
          })
        }
        aria-label="Từ ngày"
      />

      <label className="text-[13px] text-[#5C5C66]">Đến ngày</label>
      <input
        type="date"
        className={`${controlClass} w-[140px]`}
        value={range.toDate}
        onChange={(e) =>
          setFilterValue(REPORT_FILTERS_LINE.RANGE_DATE, {
            ...range,
            toDate: e.target.value,
          })
        }
        aria-label="Đến ngày"
      />

      <button
        type="button"
        onClick={() =>
          queryClient.invalidateQueries({ queryKey: ["report-table"] })
        }
        className="flex h-[30px] items-center gap-1.5 rounded-[3px] border border-[#D9D9DE] bg-white px-3 text-[13px] font-medium text-[#2B3164] hover:bg-[#F5F5F6]"
      >
        <Filter className="h-3.5 w-3.5" />
        Lấy dữ liệu
      </button>
    </div>
  );
}
