import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  posFormFieldClass,
  posFormHeight,
  posFormPadX,
  posFormRadius,
  posFormUnderlineShadow,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";
import { cn } from "@erp/ui";
import {
  useCallback,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

export type PosQuantityInputSize = PosFormSize;
export type PosQuantityVariant = "boxed" | "underline" | "ghost";

const quantityVariant: Record<
  PosQuantityVariant,
  (size: PosQuantityInputSize, showSteppers: boolean) => string
> = {
  boxed: (size, showSteppers) =>
    cn(
      "relative flex w-full min-w-0 items-stretch gap-0 border border-gray-200 bg-white text-sm transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20",
      posFormHeight[size],
      posFormRadius[size],
      showSteppers && "pr-0.5",
    ),
  underline: (size) =>
    cn(
      "relative flex w-full min-w-0 items-center gap-0 border-b border-transparent bg-transparent text-sm transition-[box-shadow] duration-150 ease-out",
      posFormHeight[size],
      posFormUnderlineShadow(),
    ),
  ghost: () =>
    "relative flex w-full min-w-0 items-center gap-0.5 bg-transparent text-sm",
};

const quantityInner = "flex min-w-0 flex-1 items-center gap-1";

const quantityInput = cn(
  posFormFieldClass,
  "w-full text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

const stepperBtnBase =
  "flex w-5 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-35";

const stepperBtnHeight: Record<PosQuantityInputSize, string> = {
  sm: "h-3.5",
  md: "h-4",
  lg: "h-[18px]",
  xl: "h-5",
};

export interface PosQuantityInputProps {
  displayValue: number;
  onChangeRaw: (raw: string) => void;
  onBumpDown?: () => void;
  onBumpUp?: () => void;
  bumpDownDisabled?: boolean;
  bumpUpDisabled?: boolean;
  min?: number;
  max?: number;
  itemLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  variant?: PosQuantityVariant;
  size?: PosQuantityInputSize;
  className?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Forward to the native `<input>` so callers can focus/select imperatively. */
  inputRef?: Ref<HTMLInputElement>;
  /** Forwarded to the native `<input>` — e.g. Enter to commit. */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

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
  size = "md",
  className,
  leading,
  trailing,
  inputRef,
  onKeyDown,
}: PosQuantityInputProps) {
  const stepperBtn = cn(stepperBtnBase, stepperBtnHeight[size]);
  const showSteppers = Boolean(onBumpDown && onBumpUp);
  const [underlineReveal, setUnderlineReveal] = useState(false);

  const handleUnderlineBlurCapture = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget;
      if (next instanceof Node && e.currentTarget.contains(next)) return;
      setUnderlineReveal(false);
    },
    [],
  );

  const underlineSteppersVisible =
    variant === "underline" && showSteppers && underlineReveal;

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
    <div
      className={cn(quantityVariant[variant](size, showSteppers), className)}
      {...rootHandlers}
    >
      <div
        className={cn(
          quantityInner,
          variant === "boxed" && "border-r border-gray-100",
          variant !== "ghost" && posFormPadX[size],
          variant === "underline" && showSteppers && "pr-6",
        )}
      >
        {leading != null ? (
          <span className="flex shrink-0 items-center">{leading}</span>
        ) : null}
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
          className={quantityInput}
        />
        {trailing != null ? (
          <span className="flex shrink-0 items-center">{trailing}</span>
        ) : null}
      </div>
      {showSteppers ? (
        <div
          className={cn(
            "flex shrink-0 flex-col justify-center border-0",
            variant === "boxed" && "py-0.5",
            variant === "underline" &&
              "absolute right-0 top-1/2 z-[1] -translate-y-1/2 py-0.5 transition-opacity duration-150",
            variant === "underline" &&
              (underlineSteppersVisible
                ? "opacity-100"
                : "pointer-events-none opacity-0"),
          )}
        >
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
