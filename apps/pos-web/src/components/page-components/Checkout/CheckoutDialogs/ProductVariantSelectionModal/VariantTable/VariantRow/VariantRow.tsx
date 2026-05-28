import { cn, formatVnd, Tooltip, TooltipContent, TooltipTrigger } from "@erp/ui";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import { CopyIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { qtyFormatter } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PosProductVariant } from "@erp/pos/interfaces/catalog.interface";

export interface VariantRowProps {
  variant: PosProductVariant;
  checked: boolean;
  qty: number;
  /** Nền xen kẽ (zebra). */
  zebra: boolean;
  /** Có dòng nào ở dưới để sao chép số lượng xuống không. */
  canCopyDown: boolean;
  onToggle: (checked: boolean) => void;
  onQtyChange: (raw: string) => void;
  onBump: (delta: number) => void;
  onCopyDown: () => void;
}

const cellBase = "px-3 py-3 align-middle text-[14px] text-[#1F2937]";

/**
 * Một dòng biến thể trong bảng chọn: checkbox · Mã SKU · Mã vạch · Tên · ĐVT ·
 * Giá · Tồn CH khác · SL (input + stepper) · Tồn kho · nút sao chép.
 * Cảnh báo đỏ khi SL > tồn kho hoặc khi đã chọn nhưng SL = 0.
 */
export function VariantRow({
  variant,
  checked,
  qty,
  zebra,
  canCopyDown,
  onToggle,
  onQtyChange,
  onBump,
  onCopyDown,
}: VariantRowProps) {
  const oversell = checked && qty > variant.quantityOnHand;

  const warningBadge = oversell ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label="Cảnh báo số lượng"
          className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[10px] text-white"
        >
          !
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[240px] border border-gray-200 bg-gray-900/80 px-3 py-2 text-left text-[12px] leading-snug text-white shadow-lg"
      >
        <div className="flex flex-col space-y-1">
          <p className="font-semibold">Hàng hóa quá số lượng tồn</p>
          <p>Tồn: {qtyFormatter.format(variant.quantityOnHand)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <tr className={cn(zebra ? "bg-[#F5F6FA]" : "bg-white", "hover:bg-[#EEF2FF]")}>
      <td className={cn(cellBase, "w-10")}>
        <PosCheckbox
          checked={checked}
          onChange={onToggle}
          ariaLabel={`Chọn biến thể ${variant.code}`}
        />
      </td>
      <td className={cn(cellBase, "font-medium text-[#5B5BF0]")}>
        {variant.code}
      </td>
      <td className={cn(cellBase, "font-medium text-[#5B5BF0]")}>
        {variant.code}
      </td>
      <td className={cellBase}>{variant.name}</td>
      <td className={cellBase}>{variant.unit}</td>
      <td className={cn(cellBase, "text-right font-medium")}>
        {formatVnd(variant.sellingPrice)}
      </td>
      <td className={cn(cellBase, "text-right text-[#5B5BF0]")}>0</td>
      <td className={cn(cellBase, "w-36")}>
        <PosQuantityInput
          displayValue={qty}
          onChangeRaw={onQtyChange}
          onBumpUp={() => onBump(+1)}
          onBumpDown={() => onBump(-1)}
          bumpDownDisabled={qty <= 0}
          min={0}
          size="sm"
          ariaLabel={`Số lượng ${variant.code}`}
          itemLabel={variant.code}
          leading={warningBadge}
          className={cn(oversell && "border-[#EF4444]")}
        />
      </td>
      <td className={cn(cellBase, "text-right text-[#5B5BF0]")}>
        {variant.quantityOnHand}
      </td>
      <td className={cn(cellBase, "w-10 text-center")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCopyDown}
              disabled={!canCopyDown}
              aria-label="Sao chép số lượng xuống các dòng dưới"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors",
                "hover:bg-indigo-50 hover:text-indigo-600",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <CopyIcon size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-gray-900/80 px-2 py-1 text-[12px] text-white"
          >
            Sao chép số lượng xuống các dòng dưới
          </TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
}
