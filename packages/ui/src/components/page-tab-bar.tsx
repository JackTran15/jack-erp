import * as React from "react";
import { cn } from "../lib/utils";

export interface PageTabItem {
  id: string;
  label: string;
  /** Optional href; if provided, renders as <a>. Otherwise uses onSelect. */
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface PageTabBarProps {
  items: PageTabItem[];
  activeId: string;
  className?: string;
  /**
   * Render slot for the active item — receives label only. Defaults to a bold heading.
   * Use this to plug in router-aware Link components for inactive items.
   */
  renderItem?: (item: PageTabItem, isActive: boolean) => React.ReactNode;
}

/**
 * Horizontal navigation strip for related sub-pages within a module
 * (e.g. Nhập kho | Xuất kho | Điều chuyển | …). The active tab is rendered
 * as bold dark text, others as blue links.
 */
export function PageTabBar({ items, activeId, className, renderItem }: PageTabBarProps) {
  return (
    <nav
      aria-label="Trang con"
      className={cn(
        "flex items-center gap-6 overflow-x-auto whitespace-nowrap border-b bg-background px-4 py-2 text-sm",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        if (renderItem) {
          return <React.Fragment key={item.id}>{renderItem(item, isActive)}</React.Fragment>;
        }
        if (isActive) {
          return (
            <span key={item.id} className="font-semibold text-foreground">
              {item.label}
            </span>
          );
        }
        const className = cn(
          "text-primary hover:underline",
          item.disabled && "pointer-events-none opacity-50",
        );
        if (item.href) {
          return (
            <a key={item.id} href={item.href} className={className}>
              {item.label}
            </a>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={className}
            onClick={item.onSelect}
            disabled={item.disabled}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
