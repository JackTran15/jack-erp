import { cn } from "@erp/ui";
import type { DailyReportTab } from "@erp/pos/types/daily-report.type";

export interface DailyReportTabsProps {
  activeTab: DailyReportTab;
  onChange: (tab: DailyReportTab) => void;
}

const TABS: ReadonlyArray<{ id: DailyReportTab; label: string }> = [
  { id: "summary", label: "Tổng hợp" },
  { id: "revenue-by-item", label: "Doanh thu theo mặt hàng" },
];

export function DailyReportTabs({ activeTab, onChange }: DailyReportTabsProps) {
  return (
    <div className="flex items-center gap-6 border-b border-[#E5E7EB] px-4">
      {TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative h-11 text-[14px] font-medium transition-colors",
              active ? "text-[#6366F1]" : "text-[#6B7280] hover:text-[#1F2233]",
            )}
          >
            {tab.label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#6366F1]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
