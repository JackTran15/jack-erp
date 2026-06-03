import { TooltipProvider } from "@erp/ui";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { VariantRow } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/ProductVariantSelectionModal/VariantTable/VariantRow/VariantRow";
import type { PosProductVariant } from "@erp/pos/interfaces/catalog.interface";

/** Trạng thái chọn của một biến thể (theo itemId). */
export interface VariantSelectState {
  checked: boolean;
  qty: number;
}

export interface VariantTableProps {
  /** Biến thể đang hiển thị (đã lọc theo chip). */
  variants: PosProductVariant[];
  /** Trạng thái chọn theo itemId. */
  selected: Record<string, VariantSelectState>;
  onToggleRow: (itemId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onQtyChange: (itemId: string, raw: string) => void;
  onBump: (itemId: string, delta: number) => void;
  onCopyDown: (itemId: string) => void;
}

const headCell =
  "px-3 py-2 text-[13px] font-semibold text-[#6B7280] whitespace-nowrap";

/**
 * Bảng biến thể với checkbox chọn từng dòng + select-all ở header, ô SL có cảnh
 * báo vượt tồn. Layout bám theo spec MISA (zebra rows, link-style cho mã/tồn).
 */
export function VariantTable({
  variants,
  selected,
  onToggleRow,
  onToggleAll,
  onQtyChange,
  onBump,
  onCopyDown,
}: VariantTableProps) {
  const allChecked =
    variants.length > 0 &&
    variants.every((v) => selected[v.itemId]?.checked === true);

  return (
    <TooltipProvider delayDuration={300}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className={`${headCell} w-10`}>
              <PosCheckbox
                checked={allChecked}
                onChange={onToggleAll}
                ariaLabel="Chọn tất cả biến thể"
              />
            </th>
            <th className={headCell}>Mã SKU</th>
            <th className={headCell}>Mã vạch</th>
            <th className={headCell}>Tên hàng hóa</th>
            <th className={headCell}>ĐVT</th>
            <th className={`${headCell} text-right`}>Giá</th>
            <th className={`${headCell} text-right`}>Tồn cửa hàng khác</th>
            <th className={`${headCell} text-right`}>SL</th>
            <th className={`${headCell} text-right`}>Tồn kho</th>
            <th className={`${headCell} w-10`} aria-label="Sao chép số lượng" />
          </tr>
        </thead>
        <tbody>
          {variants.map((variant, index) => {
            const state = selected[variant.itemId];
            const canCopyDown = index < variants.length - 1;
            return (
              <VariantRow
                key={variant.itemId}
                variant={variant}
                checked={state?.checked ?? false}
                qty={state?.qty ?? 0}
                zebra={index % 2 === 0}
                canCopyDown={canCopyDown}
                onToggle={(checked) => onToggleRow(variant.itemId, checked)}
                onQtyChange={(raw) => onQtyChange(variant.itemId, raw)}
                onBump={(delta) => onBump(variant.itemId, delta)}
                onCopyDown={() => onCopyDown(variant.itemId)}
              />
            );
          })}
        </tbody>
      </table>
    </TooltipProvider>
  );
}
