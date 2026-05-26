import { FormField, Input } from "@erp/ui";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import { TreasuryVoucherDialogModeEnum } from "./voucher-dialog.types";
import { VOUCHER_DOC_NO_PLACEHOLDER } from "./voucher-partner.constants";

interface Props {
  label: string;
  value: string;
  mode: TreasuryVoucherDialogModeEnum;
  readOnly: boolean;
}

export function VoucherDocumentNumberField({
  label,
  value,
  mode,
  readOnly,
}: Props) {
  const isDraftWithoutNumber =
    mode !== TreasuryVoucherDialogModeEnum.VIEW && !value.trim();

  return (
    <FormField label={label} layout="horizontal" labelWidth="7.5rem">
      <Input
        value={isDraftWithoutNumber ? "" : value}
        placeholder={isDraftWithoutNumber ? VOUCHER_DOC_NO_PLACEHOLDER : undefined}
        readOnly
        disabled
        className={READONLY_INPUT_CLASS}
        title={
          isDraftWithoutNumber
            ? "Số chứng từ được hệ thống cấp khi hạch toán phiếu"
            : undefined
        }
      />
    </FormField>
  );
}
