import {
  BellIcon,
  GridIcon,
  PlusIcon,
  RefreshIcon,
} from "../icons/Icon";
import { IconButton } from "../common/IconButton";
import type { InvoiceTabItem } from "../types";
import { InvoiceTab } from "./InvoiceTab";
import { LocationIndicator } from "./LocationIndicator";
import { SapoLogo } from "./SapoLogo";
import { UserMenu } from "./UserMenu";

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
    <header className="sticky top-0 z-10 flex h-11 items-center gap-1 border-b border-gray-200 bg-gray-100 px-2">
      <SapoLogo />

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
        <IconButton ariaLabel="Menu ứng dụng" icon={<GridIcon size={18} />} />
      </div>
    </header>
  );
}
