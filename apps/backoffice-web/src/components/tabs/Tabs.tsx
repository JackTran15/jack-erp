import { cn } from "@erp/ui";
import { Fragment } from "react/jsx-runtime";

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
  underline: "flex shrink-0 gap-3 border-b bg-gray-100 items-center",
  segment: "flex shrink-0 gap-1 rounded-md bg-gray-100 p-1 items-center",
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
    "px-3 py-1.5 text-sm font-semibold transition-colors",
    isActive
      ? "-mb-0.5 border-b-2 border-b-primary text-foreground"
      : "text-muted-foreground hover:text-foreground",
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
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <Fragment key={tab.id}>
            <button
              type="button"
              className={tabButtonClass(variant, isActive)}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
            {idx !== tabs.length - 1 && variant === "underline" && (
              <div className={cn("h-[20px] w-px", "bg-gray-200")} />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
