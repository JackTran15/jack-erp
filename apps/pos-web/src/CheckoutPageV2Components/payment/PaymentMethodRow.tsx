import { formatVnd } from "@erp/ui";
import { ChevronDownIcon, PlusCircleIcon } from "../icons/Icon";
import type { PaymentMethodOption } from "../types";

export interface PaymentMethodRowProps {
  method: PaymentMethodOption;
  amount: number;
  onPickMethod?: () => void;
}

/**
 * Single payment method line: leading "+" icon, dropdown-styled link
 * (purple), and the assigned amount on the right.
 */
export function PaymentMethodRow({
  method,
  amount,
  onPickMethod,
}: PaymentMethodRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <button
        type="button"
        onClick={onPickMethod}
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-indigo-600 hover:text-indigo-700"
      >
        <PlusCircleIcon size={16} className="text-green-500" />
        {method.label}
        <ChevronDownIcon size={14} className="text-indigo-600" />
      </button>
      <span className="text-[14px] font-medium text-gray-900">
        {formatVnd(amount)}
      </span>
    </div>
  );
}
