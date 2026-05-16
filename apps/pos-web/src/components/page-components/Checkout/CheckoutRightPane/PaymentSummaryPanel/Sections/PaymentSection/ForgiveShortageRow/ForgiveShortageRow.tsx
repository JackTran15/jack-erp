import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { formatVnd } from "@erp/ui";

export interface ForgiveShortageRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /**
   * Amount column on the right — the shortage the shop is writing off when
   * the box is checked. Zero when unchecked (typical paired pattern with
   * `DebtCheckRow` to keep the two affordances mutually exclusive).
   */
  amount?: number;
}

/**
 * "Bớt tiền lẻ cho khách" checkbox row — the under-paid counterpart of
 * {@link KeepChangeRow}. Visible when the cash tendered is less than the
 * amount due; toggling on writes the shortage off (the shop "rounds down"
 * the small leftover for the customer) so the sale settles cleanly.
 *
 * Pairs visually with `KeepChangeRow` and `DebtCheckRow` (40px tall, same
 * left-aligned checkbox + right-aligned amount layout).
 */
export function ForgiveShortageRow({
  checked,
  onChange,
  amount = 0,
}: ForgiveShortageRowProps) {
  return (
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 px-0 text-sm text-gray-900">
      <span className="inline-flex items-center gap-2">
        <PosCheckbox
          checked={checked}
          onChange={onChange}
          ariaLabel="Bớt tiền lẻ cho khách"
        />
        Bớt tiền lẻ cho khách
      </span>
      <span className="text-gray-900">{formatVnd(amount)}</span>
    </label>
  );
}
