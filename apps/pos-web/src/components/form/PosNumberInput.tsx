import { cn, formatVnd } from "@erp/ui";
import type { Ref } from "react";

type PosNumberAlign = "left" | "right";
type PosNumberVariant = "boxed" | "underline" | "ghost";

export interface PosNumberInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  readOnly?: boolean;
  ref?: Ref<HTMLInputElement>;
  parser?: (raw: string) => number | null;
  formatter?: (value: number) => string;
  displayValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  inputMode?: "numeric" | "decimal";
  align?: PosNumberAlign;
  variant?: PosNumberVariant;
  className?: string;
  inputClassName?: string;
}

export function PosNumberInput({
  value,
  onChange,
  min,
  max,
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
  className,
  inputClassName,
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
      type="text"
      inputMode={inputMode}
      min={min}
      max={max}
      value={displayValue ?? format(value)}
      onChange={(e) => {
        const n = parse(e.target.value);
        if (typeof n === "number" && Number.isFinite(n)) onChange(n);
      }}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        "bg-transparent text-gray-900 focus:outline-none",
        align === "right" ? "text-right" : "text-left",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        variant === "boxed" && "h-7 px-2 text-[13px]",
        variant === "underline" &&
          "h-8 w-full bg-transparent px-1 text-[16px] font-semibold text-[#0F172A]",
        variant === "ghost" && "border-0 px-0 py-2",
        readOnly && "cursor-default",
        className,
        inputClassName,
      )}
    />
  );

  if (variant === "ghost") return input;

  return (
    <div
      className={cn(
        variant === "boxed" &&
          "flex h-7 items-center rounded border border-gray-200 bg-white transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#5C6BC0]",
        variant === "underline" &&
          "flex h-8 items-center border-b border-transparent bg-transparent shadow-[inset_0_-1px_0_0_#E2E8F0] transition-[box-shadow] duration-150 ease-out focus-within:shadow-[inset_0_-2px_0_0_#6366F1]",
      )}
    >
      {input}
    </div>
  );
}
