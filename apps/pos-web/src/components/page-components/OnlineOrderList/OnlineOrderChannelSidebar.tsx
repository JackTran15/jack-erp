import { cn } from "@erp/ui";

import { GlobeIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { SalesChannelRow } from "@erp/pos/interfaces/sales-order.interface";

export interface OnlineOrderChannelSidebarProps {
  channels: ReadonlyArray<SalesChannelRow>;
  selectedChannelId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

/**
 * Sidebar kênh bán hàng của trang "Đơn hàng Online" — danh sách kênh active
 * từ `GET /mobile/sales-channels`, kênh đang chọn được tô nổi. Icon chung cho
 * mọi kênh (không dùng logo thương hiệu).
 */
export function OnlineOrderChannelSidebar({
  channels,
  selectedChannelId,
  loading,
  onSelect,
}: OnlineOrderChannelSidebarProps) {
  return (
    <nav
      aria-label="Kênh bán hàng"
      className="flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white py-2"
    >
      {loading ? (
        <p className="px-4 py-3 text-[13px] text-gray-400">Đang tải kênh…</p>
      ) : channels.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-gray-400">
          Chưa có kênh bán hàng nào.
        </p>
      ) : (
        channels.map((channel) => {
          const active = channel.id === selectedChannelId;
          return (
            <button
              key={channel.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(channel.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] transition-colors",
                active
                  ? "bg-[#EEEEFB] font-semibold text-[#5C6BC0]"
                  : "text-gray-700 hover:bg-gray-50",
              )}
            >
              <GlobeIcon size={18} className="shrink-0" />
              <span className="truncate">{channel.name}</span>
            </button>
          );
        })
      )}
    </nav>
  );
}
