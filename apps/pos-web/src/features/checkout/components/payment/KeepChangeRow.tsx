import { formatVnd } from "@erp/ui";

export interface KeepChangeRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Amount column on the right — typically 0 in observed states. */
  amount?: number;
}

/**
 * "Khách không lấy tiền thừa" checkbox row. Mirrors `DebtCheckRow` styling
 * but renders the right-hand value in muted gray (vs indigo on debt).
 *
 * Per spec 4.7.10 this row is hidden whenever a customer is selected — the
 * caller (PaymentSummaryPanel) controls visibility.
 */
export function KeepChangeRow({
  checked,
  onChange,
  amount = 0,
}: KeepChangeRowProps) {
  return (
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 px-0 text-[14px] text-gray-900">
      <span className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onChange(!checked);
            }
          }}
          className="h-4 w-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500/30"
        />
        Khách không lấy tiền thừa
      </span>
      <span className="text-gray-500">{formatVnd(amount)}</span>
    </label>
  );
}
