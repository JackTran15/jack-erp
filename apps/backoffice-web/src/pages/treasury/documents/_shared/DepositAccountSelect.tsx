import { useEffect, useMemo } from "react";
import { SingleSelect, type SingleSelectOption } from "@erp/ui";
import { useDepositAccounts } from "../../../../hooks/treasury/use-deposit-accounts";

interface Props {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * "Tài khoản nhận / Tài khoản chi" picker — deposit_accounts for the active
 * branch (GET /deposit-accounts, GĐ1). Auto-selects the account flagged
 * `isDefault` (fallback: first item) once loaded and no value is set yet.
 */
export function DepositAccountSelect({
  value,
  onChange,
  disabled,
  placeholder = "Chọn tài khoản tiền gửi",
  className,
}: Props) {
  const { data: accounts = [] } = useDepositAccounts();

  useEffect(() => {
    if (value || accounts.length === 0) return;
    const preferred = accounts.find((a) => a.isDefault) ?? accounts[0];
    onChange(preferred.id);
    // Only re-run when the account list itself changes — `value`/`onChange`
    // intentionally excluded so this fires once per fresh list, not on every
    // parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const options = useMemo<SingleSelectOption[]>(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.accountNo ? `${a.name} · ${a.accountNo}` : a.name,
      })),
    [accounts],
  );

  return (
    <SingleSelect
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
