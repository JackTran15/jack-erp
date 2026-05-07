import type { ReactNode } from "react";
import { cn } from "@erp/ui";

export interface SummaryRowProps {
  label: ReactNode;
  value: ReactNode;
  /** Visual emphasis tier for the row. */
  emphasis?: "default" | "strong" | "xl";
  className?: string;
}

/**
 * Generic "label · value" line in the payment summary. Three emphasis
 * levels cover all rows in the panel (Tổng tiền, Đặt cọc, Còn phải thu).
 */
export function SummaryRow({
  label,
  value,
  emphasis = "default",
  className,
}: SummaryRowProps) {
  const valueClass = cn(
    "text-right",
    emphasis === "default" && "text-[14px] font-medium text-gray-900",
    emphasis === "strong" && "text-[16px] font-semibold text-gray-900",
    emphasis === "xl" && "text-[20px] font-bold text-gray-900",
  );
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-[13px] text-gray-700">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
