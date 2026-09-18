import { SingleSelect } from "@erp/ui";
import {
  periodOptions,
  type OverviewPeriod,
} from "../../../_lib/period";
import { OVERVIEW_SELECT_CLASS } from "../../../_lib/selectClass";

interface Props {
  value: OverviewPeriod;
  /** Danh sách kỳ hợp lệ — cùng bảng tra mà modal "Tùy chọn" dùng. */
  periods: readonly OverviewPeriod[];
  onChange: (period: OverviewPeriod) => void;
  /** Rộng hơn mặc định khi nhãn dài (vd "3 năm gần nhất"). */
  width?: number;
}

/**
 * Dropdown "Kỳ báo cáo" nhanh ở header widget. Dùng chung state với field cùng
 * tên trong modal "Tùy chọn"; đổi ở đây áp dụng ngay, không cần xác nhận.
 */
export function HeaderPeriodSelect({ value, periods, onChange, width = 120 }: Props) {
  return (
    <div style={{ width }}>
      <SingleSelect
        options={periodOptions(periods)}
        value={value}
        onValueChange={(v) => onChange(v as OverviewPeriod)}
        className={OVERVIEW_SELECT_CLASS}
        contentClassName="text-[13px]"
      />
    </div>
  );
}
