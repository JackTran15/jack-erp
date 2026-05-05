import { formatVnd } from "../utils";
import type { CashSuggestion } from "../types";

export interface CashSuggestionListProps {
  label?: string;
  suggestions: CashSuggestion[];
  selectedId?: string | null;
  onPick: (s: CashSuggestion) => void;
}

/**
 * Vertical group: label "Gợi ý tiền mặt" + a row of clickable amount chips.
 * Selected chip gets an indigo border.
 */
export function CashSuggestionList({
  label = "Gợi ý tiền mặt",
  suggestions,
  selectedId,
  onPick,
}: CashSuggestionListProps) {
  return (
    <div className="space-y-2">
      <div className="text-[13px] text-gray-700">{label}</div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className={
                "inline-flex h-9 min-w-[88px] items-center justify-center rounded-md border bg-gray-50 px-3 text-[13px] font-medium text-gray-900 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 " +
                (active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200")
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
