import { cn, formatVnd } from "@erp/ui";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import { WarningIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { PosProductVariant } from "@erp/pos/interfaces/catalog.interface";

export interface VariantRowProps {
  variant: PosProductVariant;
  checked: boolean;
  qty: number;
  /** Nền xen kẽ (zebra). */
  zebra: boolean;
  onToggle: (checked: boolean) => void;
  onQtyChange: (raw: string) => void;
}

const cellBase = "px-3 py-3 align-middle text-[14px] text-[#1F2937]";

/**
 * Một dòng biến thể trong bảng chọn: checkbox · Mã SKU · Mã vạch · Tên · ĐVT ·
 * Giá · Tồn CH khác · SL (input) · Tồn kho. Cảnh báo đỏ khi SL > tồn kho.
 */
export function VariantRow({
  variant,
  checked,
  qty,
  zebra,
  onToggle,
  onQtyChange,
}: VariantRowProps) {
  const exceedsStock = qty > variant.quantityOnHand;

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
      <td className={cn(cellBase, "w-32")}>
        <PosQuantityInput
          displayValue={qty}
          onChangeRaw={onQtyChange}
          min={1}
          size="sm"
          ariaLabel={`Số lượng ${variant.code}`}
          itemLabel={variant.code}
          leading={
            exceedsStock ? (
              <WarningIcon
                size={16}
                className="text-[#EF4444]"
                aria-label="Số lượng vượt tồn kho hiện có"
              />
            ) : null
          }
          className={cn(exceedsStock && "border-[#EF4444]")}
        />
      </td>
      <td className={cn(cellBase, "text-right text-[#5B5BF0]")}>
        {variant.quantityOnHand}
      </td>
    </tr>
  );
}
