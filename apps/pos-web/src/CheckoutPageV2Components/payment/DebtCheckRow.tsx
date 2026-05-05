import { formatVnd } from "@erp/ui";

export interface DebtCheckRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  amount: number;
}

/**
 * "Tính vào công nợ" row — small native checkbox + label + amount.
 * Amount uses the indigo accent (#6366F1) to call attention.
 */
export function DebtCheckRow({ checked, onChange, amount }: DebtCheckRowProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[13px] text-gray-700">
      <span className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500/30"
        />
        Tính vào công nợ
      </span>
      <span className="font-medium text-indigo-500">{formatVnd(amount)}</span>
    </label>
  );
}
