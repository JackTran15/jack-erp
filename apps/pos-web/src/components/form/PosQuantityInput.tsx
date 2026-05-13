import {
  useCallback,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";
import { cn } from "@erp/ui";

/** Same set as `PosNumberInput`: `boxed` | `underline` | `ghost`. */
export type PosQuantityVariant = "boxed" | "underline" | "ghost";

export interface PosQuantityInputProps {
  /** Shown in the field (may be negative for return-credit rows). */
  displayValue: number;
  onChangeRaw: (raw: string) => void;
  onBumpDown?: () => void;
  onBumpUp?: () => void;
  bumpDownDisabled?: boolean;
  bumpUpDisabled?: boolean;
  min?: number;
  max?: number;
  /** e.g. product name for accessible stepper labels. */
  itemLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Default `boxed`. */
  variant?: PosQuantityVariant;
  className?: string;
  /** Rendered before the numeric field (e.g. prefix icon). */
  leading?: ReactNode;
  /** Rendered after the numeric field, before steppers when shown. */
  trailing?: ReactNode;
}

const stepperBtn =
  "flex h-3.5 w-5 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-35";

/**
 * Quantity field with native numeric entry and optional stacked steppers.
 * Variants mirror `PosNumberInput` for layout consistency on invoice rows.
 */
export function PosQuantityInput({
  displayValue,
  onChangeRaw,
  onBumpDown,
  onBumpUp,
  bumpDownDisabled,
  bumpUpDisabled,
  min,
  max,
  itemLabel,
  ariaLabel,
  disabled,
  variant = "boxed",
  className,
  leading,
  trailing,
}: PosQuantityInputProps) {
  const showSteppers = Boolean(onBumpDown && onBumpUp);
  const hasAffixes = leading != null || trailing != null;
  const [underlineReveal, setUnderlineReveal] = useState(false);

  const handleUnderlineBlurCapture = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget;
      if (next instanceof Node && e.currentTarget.contains(next)) return;
      setUnderlineReveal(false);
    },
    [],
  );

  const rootVariant = cn(
    "flex w-full min-w-0 items-stretch gap-0 text-sm",
    variant === "boxed" &&
      (showSteppers
        ? "rounded-md border border-gray-200 bg-white pr-0.5 transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
        : "rounded-md border border-gray-200 bg-white transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"),
    variant === "underline" &&
      cn(
        "relative items-center border-b border-transparent bg-transparent shadow-[inset_0_-1px_0_0_#E2E8F0] transition-[box-shadow] duration-150 ease-out focus-within:shadow-[inset_0_-2px_0_0_#6366F1]",
      ),
    variant === "ghost" && "items-center gap-0.5 bg-transparent",
  );

  const innerVariant = cn(
    "flex min-w-0 flex-1 items-center",
    hasAffixes && "gap-1",
    variant === "boxed" && "px-1",
    variant === "underline" && cn("px-1", showSteppers && "pr-6"),
    variant === "ghost" && "px-0",
    variant === "boxed" && showSteppers && "border-r border-gray-100",
    variant === "ghost" && "shadow-none focus-within:shadow-none",
  );

  const inputVariant = cn(
    "min-w-0 w-full bg-transparent text-right text-sm text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    variant === "boxed" && "h-7 py-0.5",
    variant === "underline" && "h-8 py-0.5 text-[#0F172A]",
    variant === "ghost" && "h-7 border-0 px-0 py-0.5",
  );

  const underlineSteppersVisible =
    variant === "underline" && showSteppers && underlineReveal;

  const stepperColumnVariant = cn(
    "flex shrink-0 flex-col justify-center border-0",
    variant === "boxed" && "py-0.5",
    variant === "underline" &&
      cn(
        "absolute right-0 top-1/2 z-[1] -translate-y-1/2 py-0.5 transition-opacity duration-150",
        underlineSteppersVisible
          ? "opacity-100"
          : "pointer-events-none opacity-0",
      ),
    variant === "ghost" && "py-0",
  );

  const rootHandlers =
    variant === "underline" && showSteppers
      ? {
          onMouseEnter: () => setUnderlineReveal(true),
          onMouseLeave: (e: MouseEvent<HTMLDivElement>) => {
            if (e.currentTarget.contains(document.activeElement)) return;
            setUnderlineReveal(false);
          },
          onFocusCapture: () => setUnderlineReveal(true),
          onBlurCapture: handleUnderlineBlurCapture,
        }
      : undefined;

  return (
    <div className={cn(rootVariant, className)} {...rootHandlers}>
      <div className={innerVariant}>
        {leading != null ? (
          <span className="flex shrink-0 items-center">{leading}</span>
        ) : null}
        <div className="min-w-0 flex-1 px-0.5">
          <input
            type="number"
            inputMode="numeric"
            disabled={disabled}
            min={min}
            max={max}
            value={displayValue}
            onChange={(e) => onChangeRaw(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            aria-label={ariaLabel}
            className={inputVariant}
          />
        </div>
        {trailing != null ? (
          <span className="flex shrink-0 items-center">{trailing}</span>
        ) : null}
      </div>
      {showSteppers ? (
        <div className={stepperColumnVariant}>
          <button
            type="button"
            disabled={disabled || bumpUpDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onBumpUp?.();
            }}
            className={cn(stepperBtn, variant === "boxed" && "rounded-t-sm")}
            aria-label={
              itemLabel ? `Tăng số lượng ${itemLabel}` : "Tăng số lượng"
            }
            tabIndex={-1}
          >
            <ChevronDownIcon size={12} className="-rotate-180" />
          </button>
          <button
            type="button"
            disabled={disabled || bumpDownDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onBumpDown?.();
            }}
            className={cn(stepperBtn, variant === "boxed" && "rounded-b-sm")}
            aria-label={
              itemLabel ? `Giảm số lượng ${itemLabel}` : "Giảm số lượng"
            }
            tabIndex={-1}
          >
            <ChevronDownIcon size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
