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
  (size: PosTextInputSize, invalid?: boolean) => string
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
  trailing?: ReactNode;
  onBlur?: () => void;
  inputMode?: "text" | "tel" | "email" | "numeric" | "search";
  autoComplete?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  /** Forwarded to the native `<input>` so callers can focus/select imperatively. */
  inputRef?: Ref<HTMLInputElement>;
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
  trailing,
  onBlur,
  inputMode,
  autoComplete,
  ariaLabel,
  className,
  inputClassName,
  inputRef,
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
      inputMode={inputMode}
      autoComplete={autoComplete}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn(
        posFormFieldClass,
        align === "right" && "text-right",
        variant === "ghost" && "border-0 px-0 py-2",
        readOnly && "cursor-default text-gray-700",
        inputClassName,
      )}
    />
  );

  if (variant === "ghost" && !trailing) return input;

  return (
    <div
      className={cn(
        textInputVariant[variant](size, invalid),
        variant !== "ghost" && posFormPadX[size],
        className,
      )}
    >
      {input}
      {trailing}
    </div>
  );
}
