import { formatVnd } from "@erp/ui";
import { PosCheckbox } from "../common/forms/PosCheckbox";

export interface DebtCheckRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  amount: number;
}

/**
 * "Tính vào công nợ" row — checkbox + label + amount.
 * Amount uses the indigo accent (#3B5BDB) to call attention.
 * Sized 40px tall to match `KeepChangeRow` so checkbox rows line up.
 */
export function DebtCheckRow({ checked, onChange, amount }: DebtCheckRowProps) {
  return (
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 text-[14px] text-gray-900">
      <span className="inline-flex items-center gap-2">
        <PosCheckbox
          checked={checked}
          onChange={onChange}
          ariaLabel="Tính vào công nợ"
        />
        Tính vào công nợ
      </span>
      <span className="font-semibold text-[#3B5BDB]">{formatVnd(amount)}</span>
    </label>
  );
}
