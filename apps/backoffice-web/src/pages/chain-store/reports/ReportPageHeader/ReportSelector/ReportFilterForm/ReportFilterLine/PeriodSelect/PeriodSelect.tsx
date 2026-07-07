import { PERIOD_PRESET_OPTIONS } from "@erp/ui";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function PeriodSelect({ value, onChange }: Props) {
  // Kỳ báo cáo luôn có giá trị (default "Tháng này") → không cần option placeholder.
  return (
    <ReportSelectField
      value={value}
      options={PERIOD_PRESET_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      }))}
      hidePlaceholder
      onChange={onChange}
    />
  );
}
