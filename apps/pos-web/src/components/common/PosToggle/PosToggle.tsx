import type { PosFormSize } from "@erp/pos/components/common/posFormDimensions";
import { cn } from "@erp/ui";

export type PosToggleSize = PosFormSize;

const toggleSize: Record<
  PosToggleSize,
  { track: string; knob: string; on: string; off: string }
> = {
  sm: {
    track: "h-5 w-9",
    knob: "h-4 w-4",
    off: "translate-x-[2px]",
    on: "translate-x-[18px]",
  },
  md: {
    track: "h-6 w-11",
    knob: "h-5 w-5",
    off: "translate-x-[2px]",
    on: "translate-x-[22px]",
  },
  lg: {
    track: "h-7 w-12",
    knob: "h-5 w-5",
    off: "translate-x-[2px]",
    on: "translate-x-[26px]",
  },
  xl: {
    track: "h-8 w-14",
    knob: "h-6 w-6",
    off: "translate-x-[2px]",
    on: "translate-x-[30px]",
  },
};

export interface PosToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: PosToggleSize;
}

export function PosToggle({
  checked,
  onChange,
  ariaLabel,
  disabled,
  size = "md",
}: PosToggleProps) {
  const s = toggleSize[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        s.track,
        checked ? "bg-green-500" : "bg-gray-300",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow transition-transform",
          s.knob,
          checked ? s.on : s.off,
        )}
      />
    </button>
  );
}
