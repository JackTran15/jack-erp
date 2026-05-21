import * as React from "react";
import { cn } from "@erp/ui";

export interface FormShellDialogBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function FormShellDialogBody({
  children,
  className,
}: FormShellDialogBodyProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-2.5 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
