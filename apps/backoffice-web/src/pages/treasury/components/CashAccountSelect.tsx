import { cn, FormField } from "@erp/ui";
import { useCashAccounts } from "../../../hooks/treasury/use-cash-accounts";

interface Props {
  value: string;
  onChange: (cashAccountId: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

export function CashAccountSelect({
  value,
  onChange,
  label = "Két tiền mặt",
  required,
  className,
  disabled,
}: Props) {
  const { data: accounts, isLoading } = useCashAccounts();

  return (
    <FormField label={label} required={required} className={className}>
      <select
        className={cn(
          "flex h-9 w-full min-w-[12rem] rounded-md border border-input bg-background px-3 py-1 text-sm",
          (disabled || isLoading) && "opacity-50",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
      >
        <option value="">
          {isLoading ? "Đang tải..." : "Chọn két tiền"}
        </option>
        {(accounts ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({Number(a.balance).toLocaleString("vi-VN")} đ)
          </option>
        ))}
      </select>
    </FormField>
  );
}
