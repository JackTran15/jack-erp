import type { ChangeEvent } from "react";

export interface QuantityInputProps {
  value: number;
  onChange: (next: number) => void;
  label?: string;
  min?: number;
  max?: number;
}

/**
 * Compact "SL: [1]" input for the toolbar. Numeric only, defaults to 1.
 */
export function QuantityInput({
  value,
  onChange,
  label = "SL",
  min = 1,
  max,
}: QuantityInputProps) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <span className="text-gray-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const n = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-10 bg-transparent text-right text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
