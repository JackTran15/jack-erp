import { cn } from "@erp/ui";
import { CHART_COLOR } from "../../_lib/echarts/baseOption";
import { formatViNumber } from "../../_lib/format";

interface Props {
  label: string;
  color: string;
  /** Bỏ trống → chip chỉ có nhãn (biến thể legend thuần, không hiện số). */
  value?: number;
  hidden?: boolean;
  onToggle?: () => void;
}

/** Chip vừa làm legend vừa làm KPI; bấm để ẩn/hiện series tương ứng. */
export function SummaryStatChip({ label, color, value, hidden, onToggle }: Props) {
  const labelOnly = value === undefined;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!hidden}
      className={cn(
        "grid w-32 shrink-0 grid-cols-[12px_1fr] items-center gap-x-2 gap-y-1 rounded-sm border border-[#E0E0E0] bg-[#EEEEEE] text-left transition-colors",
        labelOnly ? "h-10 px-3" : "h-14 py-3 pl-4 pr-3",
        onToggle && "hover:border-[#BDBDBD]",
        !onToggle && "cursor-default",
      )}
    >
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: hidden ? CHART_COLOR.disabled : color }}
      />
      <span
        className={cn(
          "truncate text-[13px] font-medium uppercase leading-4",
          hidden ? "text-[#9E9E9E]" : "text-[#212121]",
        )}
      >
        {label}
      </span>
      {labelOnly ? null : (
        <span
          className={cn(
            "col-start-2 text-[13px] font-bold leading-4 tabular-nums",
            hidden ? "text-[#9E9E9E]" : "text-[#212121]",
          )}
        >
          {formatViNumber(value)}
        </span>
      )}
    </button>
  );
}
