import * as React from "react";
import { cn } from "../lib/utils";
import { formatMoneyInteger, parseMoneyIntegerString } from "../lib/money-format";
import { Input } from "./input";

export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: number | "" | null | undefined;
  onChange: (value: number | "") => void;
};

/**
 * Ô nhập số tiền (VND, số nguyên): hiển thị nhóm hàng nghìn theo vi-VN.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, value, onChange, disabled, ...rest }, ref) => {
    const display =
      value === "" || value === null || value === undefined
        ? ""
        : formatMoneyInteger(Number(value));

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn("text-right tabular-nums", className)}
        disabled={disabled}
        value={display}
        onChange={(e) => {
          const parsed = parseMoneyIntegerString(e.target.value);
          if (parsed === null) {
            onChange("");
          } else {
            onChange(parsed);
          }
        }}
        {...rest}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";
