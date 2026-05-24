import { cn, formatVnd } from "@erp/ui";
import type { ReactNode, Ref } from "react";
import {
  posFormFieldClass,
  posFormHeight,
  posFormPadX,
  posFormRadius,
  posFormRowClass,
  posFormUnderlineShadow,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";

export type PosNumberInputSize = PosFormSize;
export type PosNumberInputVariant = "boxed" | "underline" | "ghost";

type PosNumberAlign = "left" | "right";

const numberInputVariant: Record<
  PosNumberInputVariant,
  (size: PosNumberInputSize, invalid?: boolean) => string
> = {
  boxed: (size, invalid) =>
    cn(
      posFormRowClass,
      "border bg-white transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#5C6BC0]",
      posFormHeight[size],
      posFormRadius[size],
      invalid ? "border-[#F87171]" : "border-gray-200",
    ),
  underline: (size, invalid) =>
    cn(
      posFormRowClass,
      "border-b border-transparent bg-transparent transition-[box-shadow] duration-150 ease-out",
      posFormHeight[size],
      posFormUnderlineShadow(invalid),
    ),
  ghost: () => "",
};

const numberInputField = cn(
  posFormFieldClass,
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

export interface PosNumberInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
  ref?: Ref<HTMLInputElement>;
  parser?: (raw: string) => number | null;
  formatter?: (value: number) => string;
  displayValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  inputMode?: "numeric" | "decimal";
  align?: PosNumberAlign;
  variant?: PosNumberInputVariant;
  size?: PosNumberInputSize;
  invalid?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;

  /**
   * When provided, the input renders inside a label + control + inline-error
   * row. Omit `label` for a bare input.
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

export function PosNumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  readOnly,
  ref,
  parser,
  formatter,
  displayValue,
  placeholder,
  ariaLabel,
  inputMode = "numeric",
  align = "right",
  variant = "ghost",
  size = "md",
  invalid,
  className,
  inputClassName,
  id,
  label,
  required,
  error,
  fieldLayout = "vertical",
  labelClassName,
  fieldClassName,
  contentClassName,
}: PosNumberInputProps) {
  const parse =
    parser ??
    ((raw: string) => {
      const digits = raw.replace(/\D/g, "");
      return digits === "" ? 0 : Number(digits);
    });
  const format = formatter ?? formatVnd;

  const input = (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode={inputMode}
      min={min}
      max={max}
      step={step}
      value={displayValue ?? format(value)}
      onChange={(e) => {
        const n = parse(e.target.value);
        if (typeof n === "number" && Number.isFinite(n)) onChange(n);
      }}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn(
        numberInputField,
        align === "right" ? "text-right" : "text-left",
        variant === "ghost" && "border-0 px-0 py-2",
        readOnly && "cursor-default",
        inputClassName,
      )}
    />
  );

  const control =
    variant === "ghost" ? (
      input
    ) : (
      <div
        className={cn(
          numberInputVariant[variant](size, invalid),
          posFormPadX[size],
          className,
        )}
      >
        {input}
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
