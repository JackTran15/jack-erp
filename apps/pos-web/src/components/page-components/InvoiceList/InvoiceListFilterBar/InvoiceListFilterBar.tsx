import { PosDateRangeFilter } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { GearIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { InvoiceListDateField } from "@erp/pos/constants/invoice-list.constant";
import type { PosDateRangeFilterOption } from "@erp/pos/lib/common/dateRangeFilter";

export interface InvoiceListFilterBarProps {
  dateType: InvoiceListDateField;
  onDateTypeChange: (next: InvoiceListDateField) => void;
  dateRange: PosDateRangeFilterOption;
  onDateRangeChange: (next: PosDateRangeFilterOption) => void;
  onOpenColumnSettings: () => void;
}

interface DateTypeOption {
  value: InvoiceListDateField;
  label: string;
}

const DATE_TYPE_OPTIONS: DateTypeOption[] = [
  { value: "createdAt", label: "Ngày tạo" },
  { value: "issuedAt", label: "Ngày hóa đơn" },
];

/**
 * Thanh lọc trên trang danh sách hóa đơn: chọn loại ngày + khoảng thời gian
 * (trái), nút thiết lập cột hiển thị (phải).
 */
export function InvoiceListFilterBar({
  dateType,
  onDateTypeChange,
  dateRange,
  onDateRangeChange,
  onOpenColumnSettings,
}: InvoiceListFilterBarProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <PosSelect<DateTypeOption>
          value={
            DATE_TYPE_OPTIONS.find((o) => o.value === dateType) ?? null
          }
          onChange={(item) => onDateTypeChange(item.value)}
          items={DATE_TYPE_OPTIONS}
          itemKey={(o) => o.value}
          renderItem={(o) => o.label}
          className="w-[180px]"
        />
        <PosDateRangeFilter value={dateRange} onChange={onDateRangeChange} />
      </div>

      <button
        type="button"
        aria-label="Thiết lập cột hiển thị"
        onClick={onOpenColumnSettings}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#374151] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2"
      >
        <GearIcon size={20} />
      </button>
    </div>
  );
}
