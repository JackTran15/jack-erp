import { cn } from "@erp/ui";
import type { ReactNode } from "react";

export interface PosFormItemProps {
  label: string;
  children: ReactNode;
  layout?: "vertical" | "horizontal";
  className?: string;
  labelClassName?: string;
  contentClassName?: string;
}

export function PosFormItem({
  label,
  children,
  layout = "vertical",
  className,
  labelClassName,
  contentClassName,
}: PosFormItemProps) {
  return (
    <div
      className={cn(
        "min-w-0 text-sm",
        layout === "vertical" && "flex-col",
        layout === "horizontal" && "flex items-center",
        layout === "horizontal" && "gap-2",
        layout === "vertical" && "flex gap-1",
        className,
      )}
    >
      <span className={labelClassName}>{label}</span>
      <div className={cn("min-w-0 flex-1", contentClassName)}>{children}</div>
    </div>
  );
}
