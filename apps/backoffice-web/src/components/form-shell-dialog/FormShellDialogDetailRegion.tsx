import * as React from "react";
import { cn } from "@erp/ui";

export interface FormShellDialogDetailRegionProps {
  children: React.ReactNode;
  className?: string;
}

/** Default section container for detail regions, scroll internal content. */
export function FormShellDialogDetailRegion({
  children,
  className,
}: FormShellDialogDetailRegionProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden",
        className,
      )}
    >
      {children}
    </section>
  );
}
