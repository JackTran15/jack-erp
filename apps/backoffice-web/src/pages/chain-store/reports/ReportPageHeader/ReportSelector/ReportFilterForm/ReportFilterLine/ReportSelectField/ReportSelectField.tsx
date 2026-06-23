interface Props {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Ẩn option rỗng (bắt buộc chọn 1 giá trị). */
  hidePlaceholder?: boolean;
  onChange: (value: string) => void;
}

const selectClass =
  "h-9 w-full rounded-[4px] border border-[#CCCCCC] bg-white px-3 text-[13px] text-[#333333] outline-none focus:border-[#3B6FE5]";

export function ReportSelectField({
  value,
  options,
  placeholder,
  hidePlaceholder,
  onChange,
}: Props) {
  return (
    <select
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {!hidePlaceholder && <option value="">{placeholder ?? "— Chọn —"}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
