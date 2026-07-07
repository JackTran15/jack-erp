import { SingleSelect } from "@erp/ui";

interface Props {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Ẩn option rỗng (bắt buộc chọn 1 giá trị). */
  hidePlaceholder?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

// Dropdown chuẩn của panel filter báo cáo — @erp/ui SingleSelect (đồng nhất
// màu/focus/spacing). Option rỗng đại diện "Tất cả / chưa chọn" như <select> cũ.
export function ReportSelectField({
  value,
  options,
  placeholder,
  hidePlaceholder,
  disabled,
  onChange,
}: Props) {
  const allOptions = hidePlaceholder
    ? options
    : [{ value: "", label: placeholder ?? "— Chọn —" }, ...options];

  return (
    <SingleSelect
      options={allOptions}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder ?? "— Chọn —"}
      className="h-9 px-3 text-xs"
      contentClassName="text-xs"
      disabled={disabled}
    />
  );
}
