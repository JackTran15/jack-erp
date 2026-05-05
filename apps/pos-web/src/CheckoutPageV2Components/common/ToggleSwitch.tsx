import { cn } from "@erp/ui";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * Pill-shaped toggle. Green (#22C55E) when ON, gray (#D1D5DB) when OFF.
 * Designed to be reused for both toolbar toggles ("Tách dòng") and
 * payment-panel toggles ("In hóa đơn").
 */
export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        checked ? "bg-green-500" : "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
