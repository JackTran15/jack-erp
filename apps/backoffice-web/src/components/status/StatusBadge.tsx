import type React from "react";
import { cn } from "@erp/ui";

export type StatusBadgeVariant =
  "success" | "neutral" | "danger" | "warning" | "info" | "primary";

const STATUS_BADGE_CLASSES: Record<StatusBadgeVariant, string> = {
  success: "border-success/20 bg-success-subtle text-success",
  neutral: "border-border bg-muted/70 text-muted-foreground",
  danger: "border-destructive/20 bg-destructive-subtle text-destructive",
  warning: "border-warning/20 bg-warning-subtle text-warning",
  info: "border-info/20 bg-info-subtle text-info",
  primary: "border-primary/15 bg-primary/5 text-primary",
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
