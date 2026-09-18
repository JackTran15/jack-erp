import { cn } from "@erp/ui";
import { ChevronRight } from "lucide-react";
import { formatViNumber } from "../../../_lib/format";
import { CountBadge } from "./CountBadge/CountBadge";

interface Props {
  label: string;
  value: number;
  /** Có badge → row chia cột nhãn cố định để badge thẳng hàng giữa các card. */
  count?: number;
  onClick?: () => void;
}

/** Một dòng con trong card "Hoạt động trong ngày". Cả dòng là vùng bấm. */
export function DailyActivityRow({ label, value, count, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${formatViNumber(value)}`}
      className={cn(
        "grid h-9 w-full items-center px-4 text-left text-[13px] leading-5 transition-colors",
        "hover:bg-[#F5F6FA] active:bg-[#ECEEF5]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2B2E6E]/40",
        // Cột nhãn cố định ở biến thể có badge → badge thẳng cột giữa các card.
        count === undefined
          ? "grid-cols-[1fr_auto]"
          : "grid-cols-[167px_auto_minmax(0,1fr)_auto]",
      )}
    >
      <span className="truncate text-[#212121]">{label}</span>
      {count === undefined ? null : (
        <>
          <CountBadge count={count} />
          <span />
        </>
      )}
      <span className="inline-flex items-center gap-1 justify-self-end font-semibold tabular-nums text-[#2B2E6E]">
        {formatViNumber(value)}
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    </button>
  );
}
