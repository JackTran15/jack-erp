import { cn } from "@erp/ui";

import { PosDateRangeFilter } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import {
  ONLINE_ORDER_STATUS_OPTIONS,
  type OnlineOrderStatusFilter,
  type OnlineOrderStatusOption,
} from "@erp/pos/constants/online-order-list.constant";
import type { PosDateRangeFilterOption } from "@erp/pos/lib/common/dateRangeFilter";

export interface OnlineOrderFilterBarProps {
  datePreset: PosDateRangeFilterOption;
  onDatePresetChange: (next: PosDateRangeFilterOption) => void;
  /** `YYYY-MM-DD`, hoặc "" khi khoảng đang lọc không phải một ngày. */
  selectedDate: string;
  onSelectedDateChange: (isoDate: string) => void;
  status: OnlineOrderStatusFilter;
  onStatusChange: (next: OnlineOrderStatusFilter) => void;
  /** Thiếu quyền `pos.sales-order.approve` → không render nút "Nhận xử lý". */
  showProcess: boolean;
  processDisabled: boolean;
  onProcess?: () => void;
}

/** Biểu tượng check-circle cho nút "Nhận xử lý" (PosIcons chưa có). */
function CheckCircleGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

/**
 * Thanh lọc của trang "Đơn hàng Online": preset ngày + chọn một ngày cụ thể +
 * trạng thái (trái), nút "Nhận xử lý" (phải, chỉ khi có quyền).
 */
export function OnlineOrderFilterBar({
  datePreset,
  onDatePresetChange,
  selectedDate,
  onSelectedDateChange,
  status,
  onStatusChange,
  showProcess,
  processDisabled,
  onProcess,
}: OnlineOrderFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <PosDateRangeFilter value={datePreset} onChange={onDatePresetChange} />
        <input
          type="date"
          aria-label="Ngày đơn hàng"
          value={selectedDate}
          onChange={(e) => onSelectedDateChange(e.target.value)}
          className="h-10 w-[180px] rounded-lg border border-[#E1E3EA] bg-white px-3 text-[14px] text-[#1F2233] focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]/15"
        />
        <PosSelect<OnlineOrderStatusOption>
          value={
            ONLINE_ORDER_STATUS_OPTIONS.find((o) => o.value === status) ?? null
          }
          onChange={(item) => onStatusChange(item.value)}
          items={ONLINE_ORDER_STATUS_OPTIONS}
          itemKey={(o) => o.value || "all"}
          renderItem={(o) => o.label}
          ariaLabel="Trạng thái đơn hàng"
          className="w-[180px]"
        />
      </div>

      {showProcess && (
        <button
          type="button"
          disabled={processDisabled}
          onClick={onProcess}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold transition-colors",
            processDisabled
              ? "cursor-not-allowed bg-gray-100 text-gray-400"
              : "bg-[#5C6BC0] text-white hover:bg-[#4F5DB0]",
          )}
        >
          <CheckCircleGlyph />
          Nhận xử lý
        </button>
      )}
    </div>
  );
}
