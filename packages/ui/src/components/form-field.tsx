import * as React from "react";
import { cn } from "../lib/utils";
import { Label } from "./label";

export type FormFieldLayout = "vertical" | "horizontal";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  /** @default "vertical" — label above control. "horizontal": label left, control right. */
  layout?: FormFieldLayout;
  /** Label column width when layout is horizontal. @default "8.75rem" (140px) */
  labelWidth?: string;
  children: React.ReactNode;
}

function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  layout = "vertical",
  labelWidth = "8.75rem",
  children,
}: FormFieldProps) {
  const labelNode = (
    <Label
      htmlFor={htmlFor}
      className={cn(layout === "horizontal" && "pt-2 text-sm font-normal")}
    >
      {label}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </Label>
  );

  const controlNode = (
    <>
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  if (layout === "horizontal") {
    return (
      <div
        className={cn("grid items-start gap-3", className)}
        style={{ gridTemplateColumns: `${labelWidth} 1fr` }}
      >
        {labelNode}
        <div className="min-w-0 space-y-1.5">{controlNode}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {labelNode}
      {controlNode}
    </div>
  );
}
FormField.displayName = "FormField";

export { FormField };
