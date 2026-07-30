import { cn } from "@erp/ui";
import type { PrintSettingsTab } from "@erp/pos/types/print-settings.type";

export interface PrintSettingsTabsProps {
  activeTab: PrintSettingsTab;
  onChange: (tab: PrintSettingsTab) => void;
}

const TABS: ReadonlyArray<{ id: PrintSettingsTab; label: string }> = [
  { id: "layout", label: "Bố cục" },
  { id: "content", label: "Nội dung hóa đơn" },
];

export function PrintSettingsTabs({
  activeTab,
  onChange,
}: PrintSettingsTabsProps) {
  return (
    <div className="flex items-center gap-6 border-b border-[#E5E7EB]">
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
