import { useCallback, useMemo, useRef, useState } from "react";
import {
  BellIcon,
  GridIcon,
  PlusIcon,
  RefreshIcon,
} from "../icons/Icon";
import { IconButton } from "../common/IconButton";
import type { InvoiceTabItem } from "../types";
import { AppMenuPopover } from "./AppMenuPopover";
import type { AppMenuItem } from "./appMenuItems";
import { InvoiceTab } from "./InvoiceTab";
import { LocationIndicator } from "./LocationIndicator";
import { PinnedAppButton } from "./PinnedAppButton";
import { SapoLogo } from "./SapoLogo";
import { UserMenu } from "./UserMenu";

/** Max number of pinned app buttons shown next to {@link SapoLogo}. */
export const PINNED_APP_LIMIT = 3;

export interface InvoiceTabBarProps {
  tabs: InvoiceTabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  location: string;
  userName: string;
}

/**
 * Sticky topbar: logo, invoice tabs + add button, then right side info
 * (location, notifications, sync, user, app menu).
 *
 * Owns the pinned-apps state. Clicking the pin icon in `AppMenuPopover`
 * toggles: an unpinned item is prepended (most-recent-first, deduped, capped
 * at {@link PINNED_APP_LIMIT}); an already-pinned item is removed.
 */
export function InvoiceTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  location,
  userName,
}: InvoiceTabBarProps) {
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<AppMenuItem[]>([]);
  const appMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const pinnedItemIds = useMemo(
    () => new Set(pinnedItems.map((item) => item.id)),
    [pinnedItems],
  );

  const handleTogglePin = useCallback((item: AppMenuItem) => {
    setPinnedItems((prev) => {
      if (prev.some((p) => p.id === item.id)) {
        return prev.filter((p) => p.id !== item.id);
      }
      return [item, ...prev].slice(0, PINNED_APP_LIMIT);
    });
  }, []);

  const handlePinnedItemClick = useCallback((item: AppMenuItem) => {
    console.log("[InvoiceTabBar] open pinned", item.id);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-11 items-center gap-1 border-b border-gray-200 bg-gray-100 px-2">
      <div className="flex items-center gap-2">
        <SapoLogo />
        {pinnedItems.map((item) => (
          <PinnedAppButton
            key={item.id}
            item={item}
            onClick={() => handlePinnedItemClick(item)}
          />
        ))}
      </div>

      <nav
        aria-label="Hóa đơn"
        className="flex items-end gap-0.5 self-end pl-2"
      >
        {tabs.map((tab) => (
          <InvoiceTab
            key={tab.id}
            label={tab.label}
            isActive={tab.id === activeTabId}
            isDraft={tab.isDraft}
            badgeCount={tab.badgeCount}
            onSelect={() => onSelectTab(tab.id)}
            onClose={() => onCloseTab(tab.id)}
          />
        ))}
        <IconButton
          ariaLabel="Thêm hóa đơn"
          icon={<PlusIcon size={16} />}
          onClick={onAddTab}
          className="mb-1"
        />
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <LocationIndicator location={location} />
        <IconButton ariaLabel="Thông báo" icon={<BellIcon size={18} />} />
        <IconButton ariaLabel="Đồng bộ" icon={<RefreshIcon size={18} />} />
        <UserMenu name={userName} />
        <IconButton
          ref={appMenuTriggerRef}
          ariaLabel="Menu ứng dụng"
          icon={<GridIcon size={18} />}
          active={appMenuOpen}
          aria-expanded={appMenuOpen}
          aria-haspopup="menu"
          onClick={() => setAppMenuOpen((v) => !v)}
        />
        <AppMenuPopover
          open={appMenuOpen}
          onClose={() => setAppMenuOpen(false)}
          triggerRef={appMenuTriggerRef}
          pinnedItemIds={pinnedItemIds}
          onTogglePin={handleTogglePin}
        />
      </div>
    </header>
  );
}
