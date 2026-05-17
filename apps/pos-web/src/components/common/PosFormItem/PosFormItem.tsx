import { cn } from "@erp/ui";
import type { ReactNode } from "react";
import {
  posFormItemLabelTopPad,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";

export interface PosFormItemProps {
  /** Label content — usually a string, but ReactNode is supported. */
  label: ReactNode;
  children: ReactNode;
  /** Bound to the inner control via the rendered `<label htmlFor>`. */
  htmlFor?: string;
  /** Shows a red asterisk after the label. */
  required?: boolean;
  /** Inline error message rendered below the control. */
  error?: ReactNode;
  layout?: "vertical" | "horizontal";
  /**
   * Aligns the label to the top of the control area — used when the control
   * has multiple rows (e.g. a stacked address group).
   */
  alignTop?: boolean;
  /** Matches row-control `size` for horizontal `alignTop` label offset. */
  controlSize?: PosFormSize;
  className?: string;
  labelClassName?: string;
  contentClassName?: string;
}

/**
 * Generic POS form row: label + control + optional inline error.
 *
 * Supports both horizontal (compact filter bars) and vertical (forms) layouts,
 * required-asterisk markers, and `alignTop` for multi-row controls.
 */
export function PosFormItem({
  label,
  children,
  htmlFor,
  required,
  error,
  layout = "vertical",
  alignTop,
  controlSize = "md",
  className,
  labelClassName,
  contentClassName,
}: PosFormItemProps) {
  return (
    <div
      className={cn(
        "min-w-0 text-sm",
        layout === "vertical" && "flex flex-col gap-1",
        layout === "horizontal" && "flex gap-2",
        layout === "horizontal" && (alignTop ? "items-start" : "items-center"),
        className,
      )}
    >
      <label
        htmlFor={htmlFor}
        className={cn(
          layout === "horizontal" && "shrink-0",
          layout === "horizontal" &&
            alignTop &&
            posFormItemLabelTopPad[controlSize],
          labelClassName,
        )}
      >
        {label}
        {required ? <span className="ml-0.5 text-[#E53E3E]">*</span> : null}
      </label>
      <div className={cn("min-w-0 flex-1", contentClassName)}>
        {children}
        {error ? (
          <p
            className="mt-1 text-xs text-[#E53E3E]"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
