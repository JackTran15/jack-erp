import { Check, Minus } from "lucide-react";

interface Props {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel?: string;
}

// Checkbox bespoke theo spec (checked = primary, viền unchecked = border-input, indeterminate gạch ngang).
export function ColumnConfigCheckbox({ checked, indeterminate, onChange, ariaLabel }: Props) {
  const filled = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={[
        "flex h-5 w-5 items-center justify-center rounded-[3px] border-2",
        filled
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background",
      ].join(" ")}
    >
      {indeterminate ? (
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      ) : null}
    </button>
  );
}
