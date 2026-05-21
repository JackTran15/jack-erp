import { cn } from "@erp/ui";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export type TabsVariant = "underline" | "segment";

export interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** @default "underline" */
  variant?: TabsVariant;
  className?: string;
}

const NAV_CLASS: Record<TabsVariant, string> = {
  underline: "flex shrink-0 gap-6 border-b",
  segment: "flex shrink-0 gap-1 rounded-md border bg-muted/40 p-1",
};

function tabButtonClass(variant: TabsVariant, isActive: boolean): string {
  if (variant === "segment") {
    return cn(
      "rounded px-3 py-1.5 text-sm font-semibold transition-colors",
      isActive
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );
  }

  return cn(
    "text-sm font-semibold transition-colors",
    isActive
      ? "inline-block border-b-2 border-primary px-2 pb-1.5 text-foreground"
      : "px-2 pb-1.5 text-primary hover:underline",
  );
}

export function Tabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  variant = "underline",
  className,
}: TabsProps<T>) {
  return (
    <nav className={cn(NAV_CLASS[variant], className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className={tabButtonClass(variant, isActive)}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
