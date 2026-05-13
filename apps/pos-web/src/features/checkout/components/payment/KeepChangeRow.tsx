import { PosCheckbox } from "@erp/pos/components/form/PosCheckbox";
import { formatVnd } from "@erp/ui";

export interface KeepChangeRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Amount column on the right — typically 0 in observed states. */
  amount?: number;
}

/**
 * Keep-change checkbox row (customer waives return / excess). Styling matches
 * `DebtCheckRow`; amount column uses default text color.
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
      <span className="text-gray-900">{formatVnd(amount)}</span>
    </label>
  );
}
