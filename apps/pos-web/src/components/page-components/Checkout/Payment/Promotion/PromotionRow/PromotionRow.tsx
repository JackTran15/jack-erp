import { cn } from "@erp/ui";
import type { PromotionItem } from "@erp/pos/lib/checkout/promotion.types";
import {
  kindLabel,
  resolvePromotionStatus,
  TONE_CLASS,
} from "@erp/pos/lib/checkout/promotionPresentation";

interface PromotionRowProps {
  promotion: PromotionItem;
  selected: boolean;
  onSelect: () => void;
}

export function PromotionRow({ promotion, selected, onSelect }: PromotionRowProps) {
  const status = resolvePromotionStatus(promotion);

  return (
    <button
      type="button"
      role="row"
      aria-selected={selected}
      disabled={promotion.disabled}
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[30%_15%_30%_25%] items-center px-4 py-3 text-left text-[14px] transition-colors",
        "hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-inset",
        selected ? "bg-[#EEF2FF]" : "",
        promotion.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <div role="gridcell" className="truncate font-medium text-[#0F172A]">
        {promotion.name}
      </div>
      <div role="gridcell" className="truncate text-[#475569]">
        {kindLabel(promotion)}
      </div>
      <div role="gridcell" className="truncate text-[#475569]">
        {promotion.description ?? "—"}
      </div>
      <div role="gridcell">
        {status.hasStatus ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium",
              TONE_CLASS[status.tone],
            )}
          >
            {status.label}
          </span>
        ) : (
          <span className="text-[#94A3B8]">—</span>
        )}
      </div>
    </button>
  );
}
