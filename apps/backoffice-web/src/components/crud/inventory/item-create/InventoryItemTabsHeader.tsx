import { TABS, type TabId } from "./constants";

interface InventoryItemTabsHeaderProps {
  activeTab: TabId;
  onChangeTab: (tab: TabId) => void;
}

export function InventoryItemTabsHeader({ activeTab, onChangeTab }: InventoryItemTabsHeaderProps) {
  return (
    <div
      role="tablist"
      aria-label="Tabs hàng hóa"
      className="mb-4 flex flex-wrap items-center gap-2 border-b pb-3 text-sm"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangeTab(tab.id)}
            className={
              isActive
                ? "rounded bg-primary px-3 py-1.5 text-primary-foreground"
                : "rounded border border-border px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
