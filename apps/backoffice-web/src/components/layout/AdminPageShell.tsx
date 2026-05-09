import type { ReactNode } from "react";
import { cn } from "@erp/ui";

export interface AdminPageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper for admin pages to stretch the height of the main area of the BackofficeLayout.
 * Padding is handled by the parent layout.
 */
export function AdminPageShell({ children, className }: AdminPageShellProps) {
  return (
    <div className={cn("flex min-h-full w-full min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}
