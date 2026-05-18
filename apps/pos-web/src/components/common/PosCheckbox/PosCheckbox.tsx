import { cn } from "@erp/ui";
import type { PosFormSize } from "@erp/pos/components/common/posFormDimensions";

export type PosCheckboxSize = PosFormSize;

const checkboxSize: Record<
  PosCheckboxSize,
  { box: string; icon: number; label: string }
> = {
  sm: { box: "h-4 w-4", icon: 10, label: "text-sm" },
  md: { box: "h-5 w-5", icon: 12, label: "text-base" },
  lg: { box: "h-6 w-6", icon: 14, label: "text-base" },
  xl: { box: "h-7 w-7", icon: 16, label: "text-lg" },
};

export interface PosCheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  className?: string;
  label?: string;
  size?: PosCheckboxSize;
  disabled?: boolean;
}

export function PosCheckbox({
  checked,
  onChange,
  ariaLabel,
  className,
  label,
  size = "sm",
  disabled = false,
}: PosCheckboxProps) {
  const s = checkboxSize[size];

  return (
    <label
      className={cn(
        "relative inline-flex items-center justify-center",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={cn(
          "peer absolute inset-0 opacity-0",
          disabled ? "cursor-not-allowed bg-gray-200" : "cursor-pointer",
        )}
      />
      <span
        className={cn(
          "relative flex items-center justify-center rounded-[2px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#5B5BD6] peer-focus-visible:outline-offset-2",
          s.box,
          checked
            ? "border-[#5B5BD6] bg-[#5B5BD6]"
            : "border-[#D1D5DB]  peer-hover:border-[#9CA3AF]",
          disabled ? "bg-gray-200" : "",
        )}
      >
        {checked ? (
          <svg
            viewBox="0 0 16 16"
            width={s.icon}
            height={s.icon}
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <path d="M3 8.5 6.5 12 13 5" />
          </svg>
        ) : null}
      </span>
      {label ? (
        <span className={cn("ml-2 text-[#374151]", s.label)}>{label}</span>
      ) : null}
    </label>
  );
}
