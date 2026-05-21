import { cn } from "@erp/ui";

export type FormShellDialogSectionHeadingSize = "sm" | "md" | "lg";

export interface FormShellDialogSectionHeadingProps {
  label: string;
  size?: FormShellDialogSectionHeadingSize;
  className?: string;
}

const SIZE_CLASS: Record<FormShellDialogSectionHeadingSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function FormShellDialogSectionHeading({
  label,
  size = "lg",
  className,
}: FormShellDialogSectionHeadingProps) {
  return (
    <h3
      className={cn(
        "shrink-0 font-semibold uppercase tracking-wide text-muted-foreground",
        SIZE_CLASS[size],
        className,
      )}
    >
      {label}
    </h3>
  );
}
