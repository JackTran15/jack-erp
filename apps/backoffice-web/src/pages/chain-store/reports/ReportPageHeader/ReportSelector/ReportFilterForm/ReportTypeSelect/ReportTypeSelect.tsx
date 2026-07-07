import { ReportSelectField } from "../ReportFilterLine/ReportSelectField/ReportSelectField";

interface Props {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

// Dropdown chọn loại báo cáo — bắt buộc chọn nên không có option rỗng.
export function ReportTypeSelect({ value, options, onChange }: Props) {
  return (
    <ReportSelectField
      value={value}
      options={options}
      hidePlaceholder
      onChange={onChange}
    />
  );
}
