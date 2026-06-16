interface Props {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
}

const selectClass =
  "h-9 w-full rounded-[4px] border border-[#CCCCCC] bg-white px-3 text-[13px] text-[#333333] outline-none focus:border-[#3B6FE5]";

export function ReportSelectField({ value, options, placeholder, onChange }: Props) {
  return (
    <select
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder ?? "— Chọn —"}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
