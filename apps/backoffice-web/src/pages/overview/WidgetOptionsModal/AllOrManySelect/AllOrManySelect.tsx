import { MultiSelectChips } from "@erp/ui";
import { ALL_VALUE } from "../../../../store/page-stores/overview/overview.interface";

interface Props {
  options: { value: string; label: string }[];
  /** Rỗng = "Tất cả". */
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

/**
 * Chọn nhiều có chip "Tất cả" loại trừ:
 * - chọn một mục cụ thể → bỏ chip "Tất cả";
 * - bỏ hết chip → tự khôi phục "Tất cả";
 * - chọn "Tất cả" → xoá các chip khác.
 *
 * Bên ngoài chỉ thấy mảng rỗng nghĩa là "Tất cả", nên store không cần biết
 * đến sentinel này.
 */
export function AllOrManySelect({ options, value, onChange, placeholder }: Props) {
  const displayed = value.length > 0 ? value : [ALL_VALUE];

  const handleChange = (next: string[]) => {
    if (next.length === 0) return onChange([]);
    // Vừa bấm vào "Tất cả" → quay về trạng thái tất cả.
    if (next.includes(ALL_VALUE) && !displayed.includes(ALL_VALUE)) {
      return onChange([]);
    }
    onChange(next.filter((v) => v !== ALL_VALUE));
  };

  return (
    <MultiSelectChips
      options={[{ value: ALL_VALUE, label: "Tất cả" }, ...options]}
      value={displayed}
      onValueChange={handleChange}
      placeholder={placeholder}
      className="text-[13px]"
      contentClassName="text-[13px]"
    />
  );
}
