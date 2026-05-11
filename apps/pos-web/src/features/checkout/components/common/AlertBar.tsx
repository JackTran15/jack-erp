import type { ReactNode } from "react";
import { cn } from "@erp/ui";

export interface AlertBarProps {
  children: ReactNode;
  variant?: "error" | "info";
  /** Optional inline action button (e.g. "Tải lại"). */
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * Slim inline banner for transient errors and notices. Pure presentational —
 * caller controls when to mount/unmount. Used for `cartError` / `catalogError`.
 */
export function AlertBar({
  children,
  variant = "error",
  action,
  className,
}: AlertBarProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 text-[13px]",
        variant === "error" && "bg-red-100 text-red-700",
        variant === "info" && "bg-indigo-50 text-indigo-700",
        className,
      )}
    >
      <span>{children}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded border border-current/30 px-2 py-0.5 text-[12px] font-medium hover:bg-white/40"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
