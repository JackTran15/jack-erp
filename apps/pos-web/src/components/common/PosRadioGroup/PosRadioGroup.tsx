import { cn } from "@erp/ui";
import type { ReactNode } from "react";
import { PosRadio } from "@erp/pos/components/common/PosRadio/PosRadio";
import {
  posFormHeight,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";

export type PosRadioGroupSize = PosFormSize;

const radioGroupLabel: Record<PosRadioGroupSize, string> = {
  sm: "text-sm",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

export interface PosRadioGroupOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

export interface PosRadioGroupProps<TValue extends string> {
  name: string;
  value: TValue;
  onChange: (next: TValue) => void;
  options: ReadonlyArray<PosRadioGroupOption<TValue>>;
  layout?: "horizontal" | "vertical";
  size?: PosRadioGroupSize;
  ariaLabel?: string;
  className?: string;
  optionClassName?: string;
  /** Disables every option in the group. Overrides per-option `disabled` when true. */
  disabled?: boolean;
}

export function PosRadioGroup<TValue extends string>({
  name,
  value,
  onChange,
  options,
  layout = "horizontal",
  size = "sm",
  ariaLabel,
  className,
  optionClassName,
  disabled: groupDisabled,
}: PosRadioGroupProps<TValue>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex",
        layout === "horizontal" &&
          cn("items-center gap-6", posFormHeight[size]),
        layout === "vertical" && "flex-col gap-2",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const isDisabled = groupDisabled || opt.disabled;
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex items-center gap-2 text-gray-900",
              radioGroupLabel[size],
              isDisabled
                ? "cursor-not-allowed text-gray-400"
                : "cursor-pointer",
              optionClassName,
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              disabled={isDisabled}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <PosRadio selected={selected} size={size} />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
