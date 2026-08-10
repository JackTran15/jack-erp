import { cn } from "@erp/ui";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import { PromotionStatusToneEnum } from "@erp/pos/constants/checkout.constant";
import {
  kindLabel,
  TONE_CLASS,
} from "@erp/pos/lib/page-libs/checkout/promotionPresentation";

interface PromotionRowProps {
  promotion: PromotionItem;
  selected: boolean;
  onSelect: () => void;
}

/**
 * Cột "Trạng thái" của dòng CTKM trong dialog — khác `resolvePromotionStatus`
 * (trạng thái vòng đời ACTIVE/SCHEDULED/PAUSED/EXPIRED của ERP), ở đây là
 * "áp dụng được không" cho giỏ hàng hiện tại: CTKM bị bỏ qua hiện lý do tiếng
 * Việt màu phụ; còn lại hiện "Có thể áp dụng" màu xanh (mẫu tham chiếu MISA).
 */
function applicabilityLabel(promotion: PromotionItem): {
  text: string;
  tone: (typeof PromotionStatusToneEnum)[keyof typeof PromotionStatusToneEnum];
} {
  if (promotion.disabled) {
    return { text: promotion.reason ?? "Không áp dụng", tone: PromotionStatusToneEnum.MUTED };
  }
  // Đã áp (auto-apply, khoá) khác với tùy chọn còn tick được — cùng xanh
  // nhưng chữ khác, để thu ngân biết vì sao checkbox bị khoá mà không phải
  // đoán qua mỗi trạng thái disabled của ô tick.
  if (promotion.selected) {
    return { text: "Đã áp dụng", tone: PromotionStatusToneEnum.SUCCESS };
  }
  return { text: "Có thể áp dụng", tone: PromotionStatusToneEnum.SUCCESS };
}

export function PromotionRow({ promotion, selected, onSelect }: PromotionRowProps) {
  const status = applicabilityLabel(promotion);
  // CTKM đã áp (auto-apply) hiện checked nhưng khoá — dialog này chưa cho bỏ
  // áp một CTKM đang thắng (đó là UOW-04, còn todo).
  const locked = Boolean(promotion.selected);

  return (
    <button
      type="button"
      role="row"
      aria-selected={selected}
      disabled={promotion.disabled || locked}
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[30%_15%_30%_25%] items-center px-4 py-3 text-left text-[14px] transition-colors",
        "hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-inset",
        selected ? "bg-[#EEF2FF]" : "",
        promotion.disabled ? "cursor-not-allowed opacity-50" : "",
        !promotion.disabled && locked ? "cursor-default" : "",
        !promotion.disabled && !locked ? "cursor-pointer" : "",
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
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium",
            TONE_CLASS[status.tone],
          )}
        >
          {status.text}
        </span>
      </div>
    </button>
  );
}
