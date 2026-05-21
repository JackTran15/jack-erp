import * as React from "react";
import { cn } from "@erp/ui";

export interface FormShellDialogSlotProps {
  children: React.ReactNode;
  className?: string;
}

export function FormShellDialogSlot({
  children,
  className,
}: FormShellDialogSlotProps) {
  return <div className={cn("shrink-0", className)}>{children}</div>;
}
