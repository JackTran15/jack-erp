import { cn } from "@erp/ui";

import {
  ORDER_TABS,
  type OrderTab,
} from "@erp/pos/constants/order-list.constant";

export interface OrderStatusTabsProps {
  value: OrderTab;
  onChange: (next: OrderTab) => void;
}

/**
 * 10 tab dạng pill của trang "Đơn hàng": "Tất cả", 6 trạng thái giao, "Đã hủy"
 * và 2 tab thanh toán dẫn xuất từ hoá đơn (A-06). Tab đang chọn tô indigo.
 */
export function OrderStatusTabs({ value, onChange }: OrderStatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Trạng thái đơn hàng"
      className="flex flex-wrap items-center gap-2"
    >
      {ORDER_TABS.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "h-8 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-colors",
              active
                ? "border-[#5C6BC0] bg-[#5C6BC0] text-white"
                : "border-[#E1E3EA] bg-white text-[#4B5163] hover:border-[#C7CAD3] hover:bg-[#FAFAFB]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
