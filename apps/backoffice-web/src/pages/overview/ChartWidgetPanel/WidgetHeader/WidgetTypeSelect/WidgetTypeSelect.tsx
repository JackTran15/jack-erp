import { SingleSelect } from "@erp/ui";

interface Props {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  width: number;
}

/**
 * Tiêu đề widget dạng select (row 3) — cho phép đổi loại báo cáo ngay trong ô
 * widget. Row 2 dùng tiêu đề text tĩnh thay vì component này.
 */
export function WidgetTypeSelect({ value, options, onChange, width }: Props) {
  return (
    <div style={{ width }}>
      <SingleSelect
        options={options}
        value={value}
        onValueChange={onChange}
        searchable
        placeholder="Loại báo cáo"
        className="h-9 rounded-sm border-[#BDBDBD] px-2 text-[13px]"
        contentClassName="text-[13px]"
      />
    </div>
  );
}
