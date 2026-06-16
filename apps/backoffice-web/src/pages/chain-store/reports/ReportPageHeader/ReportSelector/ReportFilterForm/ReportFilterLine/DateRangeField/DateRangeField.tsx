import type { ReportDateRangeValue } from "../../../../../../../../store/page-stores/report/report.interface";

interface Props {
  value: ReportDateRangeValue;
  onChange: (value: ReportDateRangeValue) => void;
}

const dateClass =
  "h-9 w-[150px] rounded-[4px] border border-[#CCCCCC] bg-white px-2 text-[13px] text-[#333333] outline-none focus:border-[#3B6FE5]";

export function DateRangeField({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="date"
        className={dateClass}
        value={value.fromDate}
        onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
        aria-label="Từ ngày"
      />
      <span className="text-[13px] text-[#4A4A4A]">Đến ngày</span>
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
