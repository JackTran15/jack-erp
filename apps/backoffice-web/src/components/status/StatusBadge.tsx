import type React from "react";
import { cn } from "@erp/ui";

export type StatusBadgeVariant =
  "success" | "neutral" | "danger" | "warning" | "info" | "primary";

const STATUS_BADGE_CLASSES: Record<StatusBadgeVariant, string> = {
  success:
    "border-emerald-100 bg-emerald-50/70 text-emerald-600 dark:border-emerald-100 dark:bg-emerald-50/70 dark:text-emerald-600",
  neutral:
    "border-slate-100 bg-slate-50/80 text-slate-600 dark:border-slate-100 dark:bg-slate-50/80 dark:text-slate-600",
  danger:
    "border-rose-100 bg-rose-50/75 text-rose-600 dark:border-rose-100 dark:bg-rose-50/75 dark:text-rose-600",
  warning:
    "border-amber-100 bg-amber-50/80 text-amber-600 dark:border-amber-100 dark:bg-amber-50/80 dark:text-amber-600",
  info: "border-blue-100 bg-blue-50/75 text-blue-600 dark:border-blue-100 dark:bg-blue-50/75 dark:text-blue-600",
  primary:
    "border-primary/15 bg-primary/5 text-primary dark:border-primary/15 dark:bg-primary/5 dark:text-primary",
};

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  className?: string;
}

export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium shadow-sm",
        STATUS_BADGE_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

interface ActiveStatusBadgeProps {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function ActiveStatusBadge({
  active,
  activeLabel = "Đang hoạt động",
  inactiveLabel = "Ngừng hoạt động",
}: ActiveStatusBadgeProps) {
  return (
    <StatusBadge variant={active ? "success" : "neutral"}>
      {active ? activeLabel : inactiveLabel}
    </StatusBadge>
  );
}
