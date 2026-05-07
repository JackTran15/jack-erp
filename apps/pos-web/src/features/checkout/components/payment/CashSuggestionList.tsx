import { formatVnd } from "@erp/ui";
import type { CashSuggestion } from "../types";

export interface CashSuggestionListProps {
  label?: string;
  suggestions: CashSuggestion[];
  selectedId?: string | null;
  onPick: (s: CashSuggestion) => void;
}

/**
 * Vertical group: label "Gợi ý tiền mặt" + a row of equal-width clickable
 * chips. Chip styling per spec 4.11: gray-100 background, 6px radius, 36px
 * tall, three chips share the row width.
 */
export function CashSuggestionList({
  label = "Gợi ý tiền mặt",
  suggestions,
  selectedId,
  onPick,
}: CashSuggestionListProps) {
  return (
    <div className="space-y-2 px-4">
      <div className="text-[12px] text-gray-500">{label}</div>
      <div className="flex gap-2">
        {suggestions.map((s) => {
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className={
                "inline-flex h-9 flex-1 items-center justify-center rounded-md border bg-[#F3F4F6] px-3 text-[13px] text-gray-900 transition-colors hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 " +
                (active ? "border-indigo-500" : "border-gray-200")
              }
            >
              {formatVnd(s.amount)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
