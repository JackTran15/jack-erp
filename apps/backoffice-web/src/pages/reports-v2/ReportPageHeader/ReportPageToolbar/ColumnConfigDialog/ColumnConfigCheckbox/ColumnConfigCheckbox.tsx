import { Check, Minus } from "lucide-react";

interface Props {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel?: string;
}

// Checkbox bespoke theo spec (checked #2D3A8C, viền unchecked #B0B4C0, indeterminate gạch ngang).
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
        filled ? "border-[#2D3A8C] bg-[#2D3A8C] text-white" : "border-[#B0B4C0] bg-white",
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
