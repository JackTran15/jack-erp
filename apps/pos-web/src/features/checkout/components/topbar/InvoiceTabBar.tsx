import { PlusIcon } from "@erp/pos/components/icons/Icon";
import { AppHeader } from "@erp/pos/components/layout/appHeader/AppHeader";
import { IconButton } from "@erp/pos/features/checkout/components/common/IconButton";
import type { InvoiceTabItem } from "../types";
import { InvoiceTab } from "./InvoiceTab";

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
  return (
    <AppHeader
      centerContent={
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
      }
      location={location}
      userName={userName}
    />
  );
}
