import * as React from "react";
import { cn } from "@erp/ui";

export interface FormShellDialogScrollPaneProps {
  children: React.ReactNode;
  className?: string;
}

export function FormShellDialogScrollPane({
  children,
  className,
}: FormShellDialogScrollPaneProps) {
  return (
    <div
      className={cn("min-h-0 flex flex-1 flex-col overflow-hidden", className)}
    >
      {children}
    </div>
  );
}
