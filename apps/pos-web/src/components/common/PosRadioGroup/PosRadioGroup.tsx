import { cn } from "@erp/ui";
import type { ReactNode } from "react";
import { PosRadio } from "@erp/pos/components/common/PosRadio/PosRadio";

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
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
  /** Optional class merged onto every option `<label>`. */
  optionClassName?: string;
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
}: PosRadioGroupProps<TValue>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex",
        layout === "horizontal" && "h-8 items-center gap-6",
        layout === "vertical" && "flex-col gap-2",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex items-center gap-2 text-[14px] text-gray-900",
              opt.disabled
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
              disabled={opt.disabled}
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
