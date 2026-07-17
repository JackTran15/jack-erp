import { Button, DateTimeField, PERIOD_PRESET_OPTIONS, SingleSelect } from "@erp/ui";
import { Filter } from "lucide-react";
import { REPORT_FILTERS_LINE } from "../../../../../constants/reports/report-filters.constant";
import { getReportFormLines } from "../../../../../constants/reports/report-type.constant";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";

const PRESET_OPTIONS = PERIOD_PRESET_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label,
}));

/** "Kết quả kinh doanh" — quick-bar bản 2 kỳ song song (kỳ trước/kỳ hiện tại),
 * khớp UI mẫu: cả 2 kỳ hiển thị trực tiếp trên trang, không chỉ trong dialog
 * "Chọn báo cáo". Phát hiện report nào cần bản này qua chính filter line đã
 * đăng ký (PERIOD_COMPARE_CURRENT) — không hardcode theo reportType, để tự
 * áp dụng cho báo cáo tương lai dùng cùng pattern 2 kỳ song song. */
function PeriodCompareHeaderFilter() {
  const applyFilters = useReportStore((s) => s.actions.applyFilters);
  const setFilterValue = useReportStore((s) => s.actions.setFilterValue);
  const previousPeriod =
    useReportStore((s) => s.filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS]) ?? "";
  const previousRange = useReportStore(
    (s) => s.filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE],
  ) ?? { fromDate: "", toDate: "" };
  const currentPeriod =
    useReportStore((s) => s.filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT]) ?? "";
  const currentRange = useReportStore(
    (s) => s.filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE],
  ) ?? { fromDate: "", toDate: "" };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="w-[80px] shrink-0 text-xs text-muted-foreground">Kỳ trước</label>
        <SingleSelect
          className="h-9 w-[150px] px-3 text-sm"
          options={PRESET_OPTIONS}
          value={previousPeriod}
          onValueChange={(v) =>
            setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS, v)
          }
          placeholder="Kỳ trước"
        />
        <label className="text-xs text-muted-foreground">Từ ngày</label>
        <DateTimeField
          className="h-9 w-[150px] text-sm"
          value={previousRange.fromDate}
          onChange={(e) =>
            setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE, {
              ...previousRange,
              fromDate: e.target.value,
            })
          }
          aria-label="Kỳ trước — Từ ngày"
        />
        <label className="text-xs text-muted-foreground">Đến ngày</label>
        <DateTimeField
          className="h-9 w-[150px] text-sm"
          value={previousRange.toDate}
          onChange={(e) =>
            setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE, {
              ...previousRange,
              toDate: e.target.value,
            })
          }
          aria-label="Kỳ trước — Đến ngày"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="w-[80px] shrink-0 text-xs text-muted-foreground">
          Kỳ hiện tại<span className="text-destructive"> *</span>
        </label>
        <SingleSelect
          className="h-9 w-[150px] px-3 text-sm"
          options={PRESET_OPTIONS}
          value={currentPeriod}
          onValueChange={(v) =>
            setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT, v)
          }
          placeholder="Kỳ hiện tại"
        />
        <label className="text-xs text-muted-foreground">Từ ngày</label>
        <DateTimeField
          className="h-9 w-[150px] text-sm"
          value={currentRange.fromDate}
          onChange={(e) =>
            setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE, {
              ...currentRange,
              fromDate: e.target.value,
            })
          }
          aria-label="Kỳ hiện tại — Từ ngày"
        />
        <label className="text-xs text-muted-foreground">Đến ngày</label>
        <DateTimeField
          className="h-9 w-[150px] text-sm"
          value={currentRange.toDate}
          onChange={(e) =>
            setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE, {
              ...currentRange,
              toDate: e.target.value,
            })
          }
          aria-label="Kỳ hiện tại — Đến ngày"
        />
        <Button type="button" size="sm" onClick={() => applyFilters()}>
          <Filter className="mr-1.5 h-4 w-4" />
          Lấy dữ liệu
        </Button>
      </div>
    </div>
  );
}

function SinglePeriodHeaderFilter() {
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
        options={PRESET_OPTIONS}
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

export function ReportPageHeaderFilter() {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const isPeriodCompare = getReportFormLines(reportType, branch).includes(
    REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT,
  );

  return isPeriodCompare ? <PeriodCompareHeaderFilter /> : <SinglePeriodHeaderFilter />;
}
