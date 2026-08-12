import { cn } from "@erp/ui";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import { PromotionStatusToneEnum } from "@erp/pos/constants/checkout.constant";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import {
  kindLabel,
  TONE_CLASS,
} from "@erp/pos/lib/page-libs/checkout/promotionPresentation";

interface PromotionRowProps {
  promotion: PromotionItem;
  selected: boolean;
  onSelect: () => void;
  /** Bấm dòng "Đã áp dụng" (loại) hoặc "Đã bỏ áp dụng" (khôi phục) — UOW-09. */
  onToggleExclude: () => void;
}

/**
 * Cột "Trạng thái" của dòng CTKM trong dialog — khác `resolvePromotionStatus`
 * (trạng thái vòng đời ACTIVE/SCHEDULED/PAUSED/EXPIRED của ERP), ở đây là
 * "áp dụng được không" cho giỏ hàng hiện tại: CTKM bị bỏ qua hiện lý do tiếng
 * Việt màu phụ (gồm cả "Đã bỏ áp dụng" — UOW-09); còn lại hiện "Có thể áp
 * dụng" màu xanh (mẫu tham chiếu MISA).
 *
 * Khoá theo `promotion.reason` (có lý do bị bỏ qua), không theo `disabled` —
 * từ T-04-03, `RESOURCE_TAKEN` vẫn có `reason` nhưng `disabled=false` (tick
 * được để hoán đổi), nên vẫn phải hiện "Đã bị chương trình X giành mất" chứ
 * không nhảy sang "Có thể áp dụng".
 */
function applicabilityLabel(promotion: PromotionItem): {
  text: string;
  tone: (typeof PromotionStatusToneEnum)[keyof typeof PromotionStatusToneEnum];
} {
  if (promotion.reason) {
    return { text: promotion.reason, tone: PromotionStatusToneEnum.MUTED };
  }
  // Đã áp (auto-apply, khoá) khác với tùy chọn còn tick được — cùng xanh
  // nhưng chữ khác, để thu ngân biết vì sao checkbox bị khoá mà không phải
  // đoán qua mỗi trạng thái disabled của ô tick.
  if (promotion.selected) {
    return { text: "Đã áp dụng", tone: PromotionStatusToneEnum.SUCCESS };
  }
  return { text: "Có thể áp dụng", tone: PromotionStatusToneEnum.SUCCESS };
}

export function PromotionRow({ promotion, selected, onSelect, onToggleExclude }: PromotionRowProps) {
  const status = applicabilityLabel(promotion);
  // UOW-09/ADR-07 — `locked` (đã áp, auto-apply) và `excluded` (thu ngân vừa
  // bỏ) giờ tick được: click gọi `onToggleExclude`, không phải `onSelect`
  // (luồng chọn CTKM tùy chọn/hoán đổi cũ, không đổi). Chỉ `promotion.disabled`
  // (STOPPED/hết hạn/chưa đủ điều kiện...) còn thật sự khoá — tick vào không
  // giải quyết được gì.
  const locked = Boolean(promotion.selected);
  const excluded = Boolean(promotion.excluded);
  const rowDisabled = promotion.disabled;

  const handleToggle = () => {
    if (rowDisabled) return;
    if (locked || excluded) onToggleExclude();
    else onSelect();
  };

  return (
    <div
      role="row"
      aria-selected={selected}
      aria-disabled={rowDisabled}
      onClick={handleToggle}
      className={cn(
        "grid w-full grid-cols-[30%_15%_30%_25%] items-center px-4 py-3 text-left text-[14px] transition-colors",
        "hover:bg-[#F8FAFC]",
        selected ? "bg-[#EEF2FF]" : "",
        // `promotion.disabled` (STOPPED/hết hạn/chưa đủ điều kiện...) mờ hẳn cả
        // dòng — không áp dụng được, chấm hết. `locked` (đã áp, auto-apply) thì
        // KHÔNG mờ: đây là dòng đang thắng thật, phải trông chủ động, và giờ
        // (UOW-09) bấm được để bỏ áp dụng — mờ nó đi sẽ trông như "không dùng
        // được", sai hoàn toàn ý nghĩa của "Đã áp dụng".
        promotion.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      {/* Checkbox bên trái "Tên chương trình" (mẫu tham chiếu MISA) — vùng tick
          chính cho bàn phím; click chỗ khác trên dòng vẫn chọn được (tiện chuột),
          nhưng dừng nổi bọt để không tick đúp khi bấm thẳng vào ô vuông. */}
      <div role="gridcell" className="flex min-w-0 items-center gap-2 font-medium text-[#0F172A]">
        <span onClick={(e) => e.stopPropagation()}>
          <PosCheckbox
            checked={selected}
            onChange={handleToggle}
            // Chỉ mờ ô tick khi CTKM thật sự không dùng được — `locked`/`excluded`
            // vẫn phải hiện đúng màu + dấu tick, không mờ. `PosCheckbox` dùng
            // `disabled` để quyết định luôn màu nền — trộn `locked` vào đây sẽ
            // đổi ô đã tick màu xanh thành xám, trông như CHƯA tick.
            disabled={promotion.disabled}
            ariaLabel={`Chọn ${promotion.name}`}
          />
        </span>
        <span className="truncate">{promotion.name}</span>
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
    </div>
  );
}
