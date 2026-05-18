import { formatVnd } from "@erp/ui";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";

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
      <PosNumberInput
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        formatter={(n) => formatVnd(n)}
        className="w-10"
      />
    </label>
  );
}
