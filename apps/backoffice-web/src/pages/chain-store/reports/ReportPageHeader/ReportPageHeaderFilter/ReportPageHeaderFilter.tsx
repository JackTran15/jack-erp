import { Button, PERIOD_PRESET_OPTIONS } from "@erp/ui";
import { Filter } from "lucide-react";
import { REPORT_FILTERS_LINE } from "../../../../../constants/reports/report-filters.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";

const controlClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none";

export function ReportPageHeaderFilter() {
  const applyFilters = useReportStore((s) => s.actions.applyFilters);
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

      <label className="text-xs text-muted-foreground">Từ ngày</label>
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

      <label className="text-xs text-muted-foreground">Đến ngày</label>
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

      <Button type="button" size="sm" onClick={() => applyFilters()}>
        <Filter className="mr-1.5 h-4 w-4" />
        Lấy dữ liệu
      </Button>
    </div>
  );
}
