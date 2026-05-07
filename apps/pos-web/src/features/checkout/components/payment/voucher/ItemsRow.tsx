import { cn, formatVnd } from "@erp/ui";
import type { VoucherSelectableItem } from "./types";
import { PosCheckbox } from "../../common/forms/PosCheckbox";

interface ItemsRowProps {
  item: VoucherSelectableItem;
  checked: boolean;
  onToggle: () => void;
}

export function ItemsRow({ item, checked, onToggle }: ItemsRowProps) {
  const lineTotal = item.lineTotal ?? item.qty * item.unitPrice;
  return (
    <div
      role="row"
      className={cn(
        "grid items-center px-3 py-2 text-[14px] text-[#1F2937] transition-colors",
        "grid-cols-[40px_minmax(0,1fr)_48px_96px_96px]",
        checked ? "bg-[#EEF2FF]" : "hover:bg-[#F9FAFB]",
      )}
    >
      <div role="gridcell" className="flex items-center justify-center">
        <PosCheckbox checked={checked} onChange={onToggle} ariaLabel={item.name} />
      </div>
      <div role="gridcell" className="break-words">
        {item.name}
      </div>
      <div
        role="gridcell"
        className="border-b border-dashed border-[#D1D5DB] text-right tabular-nums"
      >
        {item.qty}
      </div>
      <div role="gridcell" className="text-right tabular-nums">
        {formatVnd(item.unitPrice)}
      </div>
      <div role="gridcell" className="text-right tabular-nums">
        {formatVnd(lineTotal)}
      </div>
    </div>
  );
}
