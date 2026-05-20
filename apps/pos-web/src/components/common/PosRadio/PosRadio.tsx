import type { ReactNode } from "react";
import type { PosFormSize } from "@erp/pos/components/common/posFormDimensions";
import { cn } from "@erp/ui";

export type PosRadioSize = PosFormSize;

const radioSize: Record<PosRadioSize, { outer: string; dot: string }> = {
  sm: { outer: "h-4 w-4", dot: "h-1.5 w-1.5" },
  md: { outer: "h-5 w-5", dot: "h-2 w-2" },
  lg: { outer: "h-6 w-6", dot: "h-2.5 w-2.5" },
  xl: { outer: "h-7 w-7", dot: "h-3 w-3" },
};

const radioLabelSize: Record<PosRadioSize, string> = {
  sm: "text-sm",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

export interface PosRadioProps {
  selected: boolean;
  size?: PosRadioSize;
  className?: string;
  /**
   * When provided, renders a clickable label next to the dot — a self-contained
   * radio option. Omit `label` for a bare presentational dot.
   */
  label?: ReactNode;
  /** Native radio `name` for group semantics + arrow-key navigation. */
  name?: string;
  /** Native radio `value`. */
  value?: string | number;
  /** Called when this option is chosen. Only meaningful together with `label`. */
  onChange?: () => void;
  disabled?: boolean;
}

export function PosRadio({
  selected,
  size = "sm",
  className,
  label,
  name,
  value,
  onChange,
  disabled,
}: PosRadioProps) {
  const s = radioSize[size];

  const dot = (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        s.outer,
        label === undefined && className,
      )}
    >
      <span
        className={cn(
          "rounded-full border transition-colors",
          s.outer,
          selected ? "border-2 border-[#5B5BD6]" : "border border-[#D1D5DB]",
        )}
      />
      {selected ? (
        <span
          aria-hidden="true"
          className={cn("absolute rounded-full bg-[#5B5BD6]", s.dot)}
        />
      ) : null}
    </span>
  );

  if (label === undefined) return dot;

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2",
        radioLabelSize[size],
        disabled
          ? "cursor-not-allowed text-gray-400"
          : "cursor-pointer text-gray-900",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={() => onChange?.()}
        className="sr-only"
      />
      {dot}
      {label}
    </label>
  );
}
