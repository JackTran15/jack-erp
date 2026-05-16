import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@erp/ui";
import type { ComponentPropsWithoutRef } from "react";
import { qtyFormatter } from "@erp/pos/lib/checkout/checkoutUtils";

export interface InvoiceLineItemWarningCellProps {
  hasWarning?: boolean;
  oversell: boolean;
  /** On-hand snapshot (`maxQty`) shown in oversell tooltip. */
  onHandQty: number;
}

function WarningBadge({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      role="img"
      aria-label="Cảnh báo tồn kho"
      className={cn(
        "inline-flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-white text-[10px]",
        className,
      )}
      {...props}
    >
      !
    </span>
  );
}

/**
 * Warning glyph before quantity: tooltip khi bán vượt tồn.
 */
export function InvoiceLineItemWarningCell({
  hasWarning,
  oversell,
  onHandQty,
}: InvoiceLineItemWarningCellProps) {
  if (!hasWarning) return null;

  if (oversell) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <WarningBadge />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[240px] border border-gray-200 bg-gray-900/80 px-3 py-2 text-left text-[12px] leading-snug text-white shadow-lg"
        >
          <div className="flex flex-col space-y-1">
            <p className="font-semibold">Hàng hóa quá số lượng tồn</p>

            <div className="flex items-center gap-2 justify-between">
              <p>Tồn: {qtyFormatter.format(onHandQty)}</p>
              <p>Khách đặt: 0</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <WarningBadge />;
}
