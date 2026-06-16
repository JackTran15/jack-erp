import { MultiSelect } from "@erp/ui";
import { invoiceStatusOptions } from "../../../_mock/report-invoice-filter.mock";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

export function InvoiceStatusMultiSelect({ value, onChange }: Props) {
  return (
    <MultiSelect
      options={invoiceStatusOptions}
      value={value}
      onValueChange={onChange}
      placeholder="Chọn trạng thái…"
    />
  );
}
