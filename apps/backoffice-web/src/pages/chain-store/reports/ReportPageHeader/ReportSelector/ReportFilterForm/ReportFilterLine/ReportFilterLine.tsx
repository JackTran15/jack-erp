import {
  REPORT_FILTERS_LINE,
  REPORT_FILTERS_LINE_METADATA,
} from "../../../../../../../constants/reports/report-filters.constant";
import { useReportStore } from "../../../../../../../store/page-stores/report/report.context";
import { StoreScopeField } from "./StoreScopeField/StoreScopeField";
import { PeriodSelect } from "./PeriodSelect/PeriodSelect";
import { DateRangeField } from "./DateRangeField/DateRangeField";
import { StatisticByBranchCheckbox } from "./StatisticByBranchCheckbox/StatisticByBranchCheckbox";

interface Props {
  line: REPORT_FILTERS_LINE;
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function ReportFilterLine({ line }: Props) {
  const filters = useReportStore((s) => s.filters);
  const actions = useReportStore((s) => s.actions);

  const metadata = REPORT_FILTERS_LINE_METADATA[line] as {
    label?: string;
    isRequired?: boolean;
  };
  const label = capitalize(metadata?.label ?? "");

  function renderControl() {
    switch (line) {
      case REPORT_FILTERS_LINE.STORE:
        return (
          <StoreScopeField
            value={
              filters[REPORT_FILTERS_LINE.STORE] ?? { scope: "all", storeIds: [] }
            }
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.STORE, v)}
          />
        );
      case REPORT_FILTERS_LINE.REPORT_PERIOD:
        return (
          <PeriodSelect
            value={filters[REPORT_FILTERS_LINE.REPORT_PERIOD] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.REPORT_PERIOD, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.RANGE_DATE:
        return (
          <DateRangeField
            value={
              filters[REPORT_FILTERS_LINE.RANGE_DATE] ?? {
                fromDate: "",
                toDate: "",
              }
            }
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.RANGE_DATE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND:
        return (
          <StatisticByBranchCheckbox
            value={
              filters[REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND] ?? false
            }
            onChange={(v) =>
              actions.setFilterValue(
                REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND,
                v,
              )
            }
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex items-start gap-4 py-2">
      <div className="w-[140px] shrink-0 pt-1.5 text-[13px] text-[#4A4A4A]">
        {label}
        {metadata?.isRequired ? <span className="text-[#E53935]"> *</span> : null}
      </div>
      <div className="min-w-0 flex-1">{renderControl()}</div>
    </div>
  );
}
