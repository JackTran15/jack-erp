import { cn } from "@erp/ui";
import { CustomerDetailTabKeyEnum } from "@erp/pos/constants/checkout.constant";
import type { CustomerDetailTabKey } from "@erp/pos/constants/checkout.constant";

export interface CustomerDetailTabsProps {
  activeTab: CustomerDetailTabKey;
  onChange: (next: CustomerDetailTabKey) => void;
}

interface TabDef {
  key: CustomerDetailTabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: CustomerDetailTabKeyEnum.OVERVIEW, label: "Tổng quan" },
  { key: CustomerDetailTabKeyEnum.INFO, label: "Thông tin" },
  { key: CustomerDetailTabKeyEnum.HISTORY, label: "Lịch sử mua hàng" },
  { key: CustomerDetailTabKeyEnum.DEBT, label: "Công nợ" },
];

/**
 * Underline-style tab bar (spec 4.3): inactive `#6B7280`, active `#5C6BC0`
 * with a 2px bottom indicator. Pure presentational — the parent owns state.
 */
export function CustomerDetailTabs({
  activeTab,
  onChange,
}: CustomerDetailTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Chi tiết khách hàng"
      className="flex items-end gap-1 border-b border-gray-200"
    >
      {TABS.map((t) => {
        const active = t.key === activeTab;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative h-11 px-4 text-[14px] transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9FA8DA]/50",
              active
                ? "font-semibold text-[#5C6BC0]"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            {t.label}
            {active ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[#5C6BC0]"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
