import {
  posFormFieldClass,
  posFormHeight,
  posFormPadX,
  posFormRadius,
  posFormRowClass,
  posFormUnderlineShadow,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";
import { cn } from "@erp/ui";
import type { ReactNode, Ref } from "react";

export type PosTextInputSize = PosFormSize;
export type PosTextInputVariant = "boxed" | "underline" | "ghost";

type PosTextAlign = "left" | "right";
type PosTextType = "text" | "tel" | "email" | "date" | "search";

const textInputVariant: Record<
  PosTextInputVariant,
  (size: PosTextInputSize, invalid?: boolean, disabled?: boolean) => string
> = {
  boxed: (size, invalid, disabled) =>
    cn(
      posFormRowClass,
      "border bg-white transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#5C6BC0]",
      posFormHeight[size],
      posFormRadius[size],
      invalid ? "border-[#F87171]" : "border-gray-200",
      disabled && "bg-gray-50 opacity-70",
    ),
  underline: (size, invalid, disabled) =>
    cn(
      posFormRowClass,
      "border-b border-transparent bg-transparent transition-[box-shadow] duration-150 ease-out",
      posFormHeight[size],
      posFormUnderlineShadow(invalid),
      disabled && "opacity-70",
    ),
  ghost: () => cn(posFormRowClass, "w-auto"),
};

export interface PosTextInputProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  type?: PosTextType;
  placeholder?: string;
  align?: PosTextAlign;
  variant?: PosTextInputVariant;
  size?: PosTextInputSize;
  invalid?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  onBlur?: () => void;
  inputMode?: "text" | "tel" | "email" | "numeric" | "search";
  autoComplete?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  /** Forwarded to the native `<input>` so callers can focus/select imperatively. */
  inputRef?: Ref<HTMLInputElement>;
  /**
   * When provided, the input renders inside a label + control + inline-error row
   * (replacing the former `PosFormItem` wrapper). Omit `label` for a bare input.
   */
  label?: ReactNode;
  /** Shows a red asterisk after the label. Only used when `label` is set. */
  required?: boolean;
  /** Inline error message rendered below the control. Only used when `label` is set. */
  error?: ReactNode;
  /** Label/control arrangement when `label` is set. */
  fieldLayout?: "vertical" | "horizontal";
  /** Class for the `<label>` (e.g. fixed-width column in horizontal forms). */
  labelClassName?: string;
  /** Class for the outer field-row wrapper. */
  fieldClassName?: string;
  /** Class for the control area (control + error). */
  contentClassName?: string;
}

export function PosTextInput({
  value,
  onChange,
  id,
  type = "text",
  placeholder,
  align = "left",
  variant = "boxed",
  size = "md",
  invalid,
  readOnly,
  disabled,
  trailing,
  onBlur,
  inputMode,
  autoComplete,
  ariaLabel,
  className,
  inputClassName,
  inputRef,
  label,
  required,
  error,
  fieldLayout = "vertical",
  labelClassName,
  fieldClassName,
  contentClassName,
}: PosTextInputProps) {
  const input = (
    <input
      ref={inputRef}
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      inputMode={inputMode}
      autoComplete={autoComplete}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn(
        posFormFieldClass,
        align === "right" && "text-right",
        variant === "ghost" && "border-0 px-0 py-2",
        readOnly && "cursor-default text-gray-700",
        disabled && "cursor-not-allowed bg-transparent text-gray-700",
        inputClassName,
      )}
    />
  );

  const control =
    variant === "ghost" && !trailing ? (
      input
    ) : (
      <div
        className={cn(
          textInputVariant[variant](size, invalid, disabled),
          variant !== "ghost" && posFormPadX[size],
          className,
        )}
      >
        {input}
        {trailing}
      </div>
    );

  if (label === undefined) return control;

  return (
    <div
      className={cn(
        "min-w-0 text-sm",
        fieldLayout === "vertical" && "flex flex-col gap-1",
        fieldLayout === "horizontal" && "flex items-center gap-2",
        fieldClassName,
      )}
    >
      <label
        htmlFor={id}
        className={cn(fieldLayout === "horizontal" && "shrink-0", labelClassName)}
      >
        {label}
        {required ? <span className="ml-0.5 text-[#E53E3E]">*</span> : null}
      </label>
      <div className={cn("min-w-0 flex-1", contentClassName)}>
        {control}
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
