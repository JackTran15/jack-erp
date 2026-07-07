import { Button, DateTimeField, PERIOD_PRESET_OPTIONS, SingleSelect } from "@erp/ui";
import { Filter } from "lucide-react";
import { REPORT_FILTERS_LINE } from "../../../../../constants/reports/report-filters.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";

export function ReportPageHeaderFilter() {
  const applyFilters = useReportStore((s) => s.actions.applyFilters);
  const period =
    useReportStore((s) => s.filters[REPORT_FILTERS_LINE.REPORT_PERIOD]) ?? "";
  const range = useReportStore(
    (s) => s.filters[REPORT_FILTERS_LINE.RANGE_DATE],
  ) ?? { fromDate: "", toDate: "" };
  const setFilterValue = useReportStore((s) => s.actions.setFilterValue);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SingleSelect
        className="h-9 w-[150px] px-3 text-sm"
        options={PERIOD_PRESET_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
        value={period}
        onValueChange={(v) =>
          setFilterValue(REPORT_FILTERS_LINE.REPORT_PERIOD, v)
        }
        placeholder="Kỳ báo cáo"
      />

      <label className="text-xs text-muted-foreground">Từ ngày</label>
      <DateTimeField
        className="h-9 w-[150px] text-sm"
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
      <DateTimeField
        className="h-9 w-[150px] text-sm"
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
