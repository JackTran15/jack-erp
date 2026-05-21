import * as React from "react";
import { cn } from "@erp/ui";

export interface FormShellDialogTwoPaneProps {
  children: React.ReactNode;
  className?: string;
}

export function FormShellDialogTwoPane({
  children,
  className,
}: FormShellDialogTwoPaneProps) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-[1fr_280px]", className)}>
      {children}
    </div>
  );
}

export interface FormShellDialogPaneProps {
  children: React.ReactNode;
  className?: string;
}

export function FormShellDialogPane({
  children,
  className,
}: FormShellDialogPaneProps) {
  return <div className={className}>{children}</div>;
}
