import { PosDateRangeFilter } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import {
  ORDER_DATE_FIELD_OPTIONS,
  ORDER_LABEL_OPTIONS,
  type OrderDateField,
  type OrderDateFieldOption,
  type OrderLabelOption,
} from "@erp/pos/constants/order-list.constant";
import type { PosDateRangeFilterOption } from "@erp/pos/lib/common/dateRangeFilter";

export interface OrderFilterBarProps {
  dateField: OrderDateField;
  onDateFieldChange: (next: OrderDateField) => void;
  datePreset: PosDateRangeFilterOption;
  onDatePresetChange: (next: PosDateRangeFilterOption) => void;
  /** "" = không lọc nhãn; `STOCK_SHORT` = "Thiếu hàng". */
  label: string;
  onLabelChange: (next: OrderLabelOption["value"]) => void;
}

/**
 * Bộ lọc đầu trang "Đơn hàng": loại ngày (Ngày tạo / Ngày GH / Ngày HĐ) +
 * khoảng ngày (mặc định "7 ngày gần đây") + nhãn (A-10: chỉ "Thiếu hàng").
 * Trả fragment: các ô nằm chung một hàng flex với `OrderToolbar` do trang dựng.
 */
export function OrderFilterBar({
  dateField,
  onDateFieldChange,
  datePreset,
  onDatePresetChange,
  label,
  onLabelChange,
}: OrderFilterBarProps) {
  return (
    <>
      <PosSelect<OrderDateFieldOption>
        value={ORDER_DATE_FIELD_OPTIONS.find((o) => o.value === dateField) ?? null}
        onChange={(item) => onDateFieldChange(item.value)}
        items={ORDER_DATE_FIELD_OPTIONS}
        itemKey={(o) => o.value}
        renderItem={(o) => o.label}
        ariaLabel="Loại ngày"
        className="w-[160px] shrink-0"
      />
      {/* Nút kích hoạt của PosDateRangeFilter cố định 280px — thu về 180px cho vừa một hàng. */}
      <div className="shrink-0 [&>div>button:first-child]:w-[180px]">
        <PosDateRangeFilter value={datePreset} onChange={onDatePresetChange} />
      </div>
      <PosSelect<OrderLabelOption>
        value={
          label ? (ORDER_LABEL_OPTIONS.find((o) => o.value === label) ?? null) : null
        }
        onChange={(item) => onLabelChange(item.value)}
        items={ORDER_LABEL_OPTIONS}
        itemKey={(o) => o.value || "all"}
        renderItem={(o) => o.label}
        placeholder="Chọn nhãn"
        ariaLabel="Lọc theo nhãn"
        className="w-[160px] shrink-0"
      />
    </>
  );
}
