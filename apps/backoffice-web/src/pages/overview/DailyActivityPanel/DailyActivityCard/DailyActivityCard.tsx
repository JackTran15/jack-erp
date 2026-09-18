import { cn } from "@erp/ui";
import { ChevronRight } from "lucide-react";
import type { DailyActivityCardData } from "../../_mock/dailyActivity.mock";
import { formatViNumber } from "../../_lib/format";
import { DailyActivityRow } from "./DailyActivityRow/DailyActivityRow";

interface Props {
  card: DailyActivityCardData;
  loading?: boolean;
}

function SkeletonBar({ className }: { className?: string }) {
  return <span className={cn("block h-3 rounded-sm bg-[#EEEEEE]", className)} />;
}

/** Một cột của row 1: header tổng + danh sách dòng con. */
export function DailyActivityCard({ card, loading }: Props) {
  return (
    <article className="flex flex-col rounded-sm border border-[#E0E0E0] border-t-[3px] border-t-[#2B2E6E] pb-1">
      <div
        className={cn(
          "flex h-9 items-center justify-between border-b border-[#E0E0E0] px-4 text-[13px] font-bold leading-5",
          card.totalClickable &&
            "cursor-pointer transition-colors hover:bg-[#F5F6FA]",
        )}
      >
        <span className="truncate text-[#212121]">{card.title}</span>
        {loading ? (
          <SkeletonBar className="w-10" />
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              card.totalClickable ? "text-[#2B2E6E]" : "text-[#212121]",
            )}
          >
            {formatViNumber(card.total)}
            {card.totalClickable ? (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            ) : null}
          </span>
        )}
      </div>

      {card.rows.map((row) => (
        <DailyActivityRow
          key={row.key}
          label={row.label}
          value={row.value}
          count={row.count}
        />
      ))}
    </article>
  );
}
