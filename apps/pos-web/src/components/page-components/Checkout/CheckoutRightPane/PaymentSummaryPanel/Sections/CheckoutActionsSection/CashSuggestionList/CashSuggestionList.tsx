import { formatVnd } from "@erp/ui";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";

const LABEL = "Gợi ý tiền mặt";

/**
 * Vertical group: label "Gợi ý tiền mặt" + a row of equal-width clickable
 * chips. Đọc suggestions + selectedSuggestionId + handlePickSuggestion từ
 * payment hook.
 */
export function CashSuggestionList() {
  const { suggestions, selectedSuggestionId, handlePickSuggestion } =
    useCheckoutPayment();

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2 px-4">
      <div className="text-[12px] text-gray-500">{LABEL}</div>
      <div className="flex gap-2">
        {suggestions.map((s) => {
          const active = s.id === selectedSuggestionId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handlePickSuggestion(s)}
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
