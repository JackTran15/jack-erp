import { cn } from "@erp/ui";
import { formatViDateTime } from "@erp/pos/lib/dateTime";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { DraftInvoice } from "@erp/pos/lib/checkout/checkout.types";

interface DraftRowProps {
  draft: DraftInvoice;
  selected: boolean;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export function DraftRow({ draft, selected, onSelect, onDelete }: DraftRowProps) {
  return (
    <button
      type="button"
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full items-center gap-4 px-4 py-3.5 text-left text-[14px] text-[#1F2233] transition-colors",
        "grid-cols-[1.2fr_1fr_1fr_1.3fr_24px]",
        "border-b border-[#F0F1F5] last:border-b-0",
        selected ? "bg-[#EEEEFB]" : "hover:bg-[#F7F8FA]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-inset",
      )}
    >
      <span role="gridcell" className="tabular-nums">
        {draft.invoiceNumber}
      </span>
      <span role="gridcell" className="truncate">
        {draft.customerName ?? ""}
      </span>
      <span role="gridcell" className="truncate">
        {draft.customerPhone ?? ""}
      </span>
      <span role="gridcell" className="tabular-nums text-[#4B5163]">
        {formatViDateTime(draft.createdAt, { withSeconds: true })}
      </span>
      <span role="gridcell" className="flex items-center justify-center">
        {onDelete ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Xóa hóa đơn ${draft.invoiceNumber}`}
            onClick={onDelete}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDelete(e as unknown as React.MouseEvent);
              }
            }}
            className={cn(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[#E74C5E] transition-colors",
              "hover:bg-[rgba(231,76,94,0.1)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E74C5E]",
            )}
          >
            <CloseIcon size={16} strokeWidth={2} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
