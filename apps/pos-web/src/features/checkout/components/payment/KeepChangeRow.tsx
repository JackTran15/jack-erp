import { PosCheckbox } from "@erp/pos/components/form/PosCheckbox";
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
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 px-0 text-sm text-gray-900">
      <span className="inline-flex items-center gap-2">
        <PosCheckbox
          checked={checked}
          onChange={onChange}
          ariaLabel="Khách không lấy tiền thừa"
        />
        Khách không lấy tiền thừa
      </span>
      <span className="text-gray-500">{formatVnd(amount)}</span>
    </label>
  );
}
