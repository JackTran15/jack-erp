import { cn } from "@erp/ui";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import { PromotionRow } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/PromotionSelectionModal/PromotionTable/PromotionRow/PromotionRow";

interface PromotionTableProps {
  rows: PromotionItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PromotionTable({ rows, selectedId, onSelect }: PromotionTableProps) {
  return (
    <div role="grid" aria-label="Danh sách chương trình khuyến mãi">
      <div
        role="row"
        className={cn(
          "grid items-center rounded-t-[4px] bg-[#F5F6F8] px-4 py-3",
          "grid-cols-[30%_15%_30%_25%] text-[14px] font-semibold text-[#0F172A]",
        )}
      >
        <div role="columnheader">Tên chương trình</div>
        <div role="columnheader">Hình thức</div>
        <div role="columnheader">Mô tả</div>
        <div role="columnheader">Trạng thái</div>
      </div>

      <div
        className={cn(
          "min-h-[280px] divide-y divide-[#EEF0F3] bg-white",
          rows.length === 0 ? "flex items-center justify-center" : "",
        )}
      >
        {rows.length === 0 ? (
          <p className="py-12 text-[14px] text-[#94A3B8]">
            Chưa có chương trình khuyến mãi nào để áp dụng
          </p>
        ) : (
          rows.map((promotion) => (
            <PromotionRow
              key={promotion.id}
              promotion={promotion}
              selected={promotion.id === selectedId}
              onSelect={() => !promotion.disabled && onSelect(promotion.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
