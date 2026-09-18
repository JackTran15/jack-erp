import { SingleSelect } from "@erp/ui";
import { OVERVIEW_SELECT_CLASS } from "../../../_lib/selectClass";

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
        placeholder="Loại báo cáo"
        className={OVERVIEW_SELECT_CLASS}
        contentClassName="text-[13px]"
      />
    </div>
  );
}
