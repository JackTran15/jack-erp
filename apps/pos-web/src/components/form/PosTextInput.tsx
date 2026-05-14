import { cn } from "@erp/ui";
import type { ReactNode, Ref } from "react";

type PosTextAlign = "left" | "right";
type PosTextVariant = "boxed" | "underline" | "ghost";
type PosTextType = "text" | "tel" | "email" | "date" | "search";

export interface PosTextInputProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  type?: PosTextType;
  placeholder?: string;
  align?: PosTextAlign;
  variant?: PosTextVariant;
  /** Renders a red focus/border treatment. */
  invalid?: boolean;
  readOnly?: boolean;
  /** Slot rendered to the right of the input — icons, scan/clear buttons, … */
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

/**
 * POS text input shared across forms and tables.
 *
 * Variants:
 *  - `boxed` (default) — bordered 28 px tall input for compact filter bars.
 *  - `underline` — 32 px tall inset-shadow underline used in dialogs / forms.
 *  - `ghost` — no chrome (e.g. inline-editable cells).
 *
 * Optional `trailing` slot is rendered inside the wrapper so callers can attach
 * trailing icons (calendar, scan…) without rewrapping.
 */
export function PosTextInput({
  value,
  onChange,
  id,
  type = "text",
  placeholder,
  align = "left",
  variant = "boxed",
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
        "min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none",
        align === "right" && "text-right",
        variant === "boxed" && "h-7 px-2",
        variant === "underline" && "h-8 px-0 py-1 text-[14px]",
        variant === "ghost" && "border-0 px-0 py-2 text-[13px]",
        readOnly && "cursor-default text-gray-700",
        inputClassName,
      )}
    />
  );

  if (variant === "ghost" && !trailing) return input;

  return (
    <div
      className={cn(
        variant === "boxed" &&
          "flex h-7 items-center gap-2 rounded border bg-white transition-[border-color,box-shadow] duration-150 ease-out",
        variant === "boxed" &&
          (invalid
            ? "border-[#F87171]"
            : "border-gray-200 focus-within:border-[#5C6BC0]"),
        variant === "underline" &&
          "flex h-8 items-center gap-2 border-b border-transparent bg-transparent transition-[box-shadow] duration-150 ease-out",
        variant === "underline" &&
          (invalid
            ? "shadow-[inset_0_-2px_0_0_#F87171]"
            : "shadow-[inset_0_-1px_0_0_#E5E7EB] focus-within:shadow-[inset_0_-2px_0_0_#5B5BD6]"),
        variant === "ghost" && "flex items-center gap-2",
        className,
      )}
    >
      {input}
      {trailing}
    </div>
  );
}
