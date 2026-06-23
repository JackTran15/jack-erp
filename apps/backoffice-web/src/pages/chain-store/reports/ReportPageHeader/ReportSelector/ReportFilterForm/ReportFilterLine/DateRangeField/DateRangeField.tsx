import type { ReportDateRangeValue } from "../../../../../../../../store/page-stores/report/report.interface";

interface Props {
  value: ReportDateRangeValue;
  onChange: (value: ReportDateRangeValue) => void;
}

const dateClass =
  "h-9 min-w-0 flex-1 rounded-[4px] border border-[#CCCCCC] bg-white px-2 text-xs text-[#333333] outline-none focus:border-[#3B6FE5]";

export function DateRangeField({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        className={dateClass}
        value={value.fromDate}
        onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
        aria-label="Từ ngày"
      />
      <span className="whitespace-nowrap text-xs text-muted-foreground">Đến ngày</span>
      <input
        type="date"
        className={dateClass}
        value={value.toDate}
        onChange={(e) => onChange({ ...value, toDate: e.target.value })}
        aria-label="Đến ngày"
      />
    </div>
  );
}
