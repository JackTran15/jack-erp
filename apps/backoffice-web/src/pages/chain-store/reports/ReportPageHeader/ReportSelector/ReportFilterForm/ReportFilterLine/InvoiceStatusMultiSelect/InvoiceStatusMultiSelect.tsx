import { INVOICE_STATUS_OPTIONS } from "@erp/shared-interfaces";
import { MultiSelect } from "@erp/ui";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

export function InvoiceStatusMultiSelect({ value, onChange }: Props) {
  return (
    <MultiSelect
      options={INVOICE_STATUS_OPTIONS}
      value={value}
      onValueChange={onChange}
      placeholder="Chọn trạng thái…"
    />
  );
}
