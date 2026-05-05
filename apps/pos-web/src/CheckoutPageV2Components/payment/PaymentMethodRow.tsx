import { forwardRef } from "react";
import { ChevronDownIcon, PlusCircleIcon } from "../icons/Icon";
import { formatVnd } from "@erp/ui";
import type { PaymentMethod, PaymentMethodOption } from "../types";

export interface PaymentMethodRowProps {
  method: PaymentMethodOption;
  /** Currently entered/selected paid amount. */
  amount: number;
  /** When true the amount is read-only (e.g. for non-cash methods that don't
   *  track tendered cash). Defaults to editable. */
  amountReadOnly?: boolean;
  /** All available payment methods — clicking the label cycles through them. */
  methods: readonly PaymentMethodOption[];
  onChangeMethod: (method: PaymentMethod) => void;
  onChangeAmount: (raw: string) => void;
}

/**
 * Single payment method line: leading "+" icon, link-styled method label
 * that cycles through `methods` on click, and the editable paid amount.
 */
export const PaymentMethodRow = forwardRef<
  HTMLInputElement,
  PaymentMethodRowProps
>(function PaymentMethodRow(
  {
    method,
    amount,
    amountReadOnly,
    methods,
    onChangeMethod,
    onChangeAmount,
  },
  amountInputRef,
) {
  const cycle = () => {
    const idx = methods.findIndex((m) => m.value === method.value);
    const next = methods[(idx + 1) % methods.length];
    if (next) onChangeMethod(next.value);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <button
        type="button"
        onClick={cycle}
        aria-label={`Đổi hình thức thanh toán (đang là ${method.label})`}
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-indigo-600 hover:text-indigo-700"
      >
        <PlusCircleIcon size={16} className="text-green-500" />
        {method.label}
        <ChevronDownIcon size={14} className="text-indigo-600" />
      </button>
      {amountReadOnly ? (
        <span className="text-[14px] font-medium text-gray-900">
          {formatVnd(amount)}
        </span>
      ) : (
        <input
          ref={amountInputRef}
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={amount || ""}
          onChange={(e) => onChangeAmount(e.target.value)}
          aria-label={`Số tiền ${method.label}`}
          placeholder="0"
          className="h-8 w-[120px] rounded-md border border-transparent bg-transparent px-2 text-right text-[14px] font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}
    </div>
  );
});
