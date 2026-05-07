import { cn } from "@erp/ui";

export interface PosCheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  className?: string;
}

export function PosCheckbox({
  checked,
  onChange,
  ariaLabel,
  className,
}: PosCheckboxProps) {
  return (
    <label
      className={cn(
        "relative inline-flex h-4 w-4 cursor-pointer items-center justify-center",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 cursor-pointer opacity-0"
      />
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-[2px] border transition-colors",
          checked
            ? "border-[#5B5BD6] bg-[#5B5BD6]"
            : "border-[#D1D5DB] bg-white peer-hover:border-[#9CA3AF]",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#5B5BD6] peer-focus-visible:outline-offset-2",
        )}
      >
        {checked ? (
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5 6.5 12 13 5" />
          </svg>
        ) : null}
      </span>
    </label>
  );
}
