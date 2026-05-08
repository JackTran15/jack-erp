import { cn } from "@erp/ui";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconButton } from "@erp/pos/features/checkout/components/common/IconButton";
import {
  BellIcon,
  GridIcon,
  RefreshIcon,
} from "@erp/pos/components/icons/Icon";
import { AppMenuPopover } from "./AppMenuPopover";
import {
  APP_MENU_ITEMS,
  resolveSelectedAppMenuItemId,
  type AppMenuItem,
} from "./appMenuItems";
import { LocationIndicator } from "./LocationIndicator";
import { PinnedAppButton } from "./PinnedAppButton";
import { SapoLogo } from "./SapoLogo";
import { UserMenu } from "./UserMenu";

export interface AppHeaderProps {
  className?: string;
  centerContent?: ReactNode;
  title?: string;
  location: string;
  userName: string;
}

const APP_HEADER_PINNED_ITEM_LIMIT = 2;
const APP_HEADER_PINNED_STORAGE_KEY = "pos.appHeader.pinnedItemIds";

function readPinnedItems(): AppMenuItem[] {
  if (typeof window === "undefined") return [];

  try {
    const rawIds = JSON.parse(
      window.localStorage.getItem(APP_HEADER_PINNED_STORAGE_KEY) ?? "[]",
    );

    if (!Array.isArray(rawIds)) return [];

    return rawIds
      .map((id) => APP_MENU_ITEMS.find((item) => item.id === id))
      .filter((item): item is AppMenuItem => Boolean(item))
      .slice(0, APP_HEADER_PINNED_ITEM_LIMIT);
  } catch {
    return [];
  }
}

function writePinnedItems(items: AppMenuItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    APP_HEADER_PINNED_STORAGE_KEY,
    JSON.stringify(items.map((item) => item.id)),
  );
}

/**
 * Shared shell header used across POS module pages. Keeps the common right-side
 * controls (location, notify, sync, user, app menu) while callers provide the
 * variable left/center content.
 */
export function AppHeader({
  className,
  centerContent,
  title,
  location,
  userName,
}: AppHeaderProps) {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [pinnedItems, setPinnedItems] =
    useState<AppMenuItem[]>(readPinnedItems);
  const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const activeItemId = useMemo(
    () => resolveSelectedAppMenuItemId(routerLocation.pathname),
    [routerLocation.pathname],
  );
  const activePageItem = useMemo(
    () =>
      APP_MENU_ITEMS.find((item) => item.id === activeItemId && item.pinnable),
    [activeItemId],
  );
  const pinnedItemIds = useMemo(
    () => new Set(pinnedItems.map((item) => item.id)),
    [pinnedItems],
  );
  const visiblePinnedItems = useMemo(() => {
    if (!activePageItem) {
      return pinnedItems;
    }

    return [
      ...pinnedItems.filter((item) => item.id !== activePageItem.id),
      activePageItem,
    ];
  }, [activePageItem, pinnedItems]);

  const handleTogglePin = (item: AppMenuItem) => {
    setPinnedItems((prev) => {
      const next = prev.some((p) => p.id === item.id)
        ? prev.filter((p) => p.id !== item.id)
        : [item, ...prev].slice(0, APP_HEADER_PINNED_ITEM_LIMIT);

      writePinnedItems(next);
      return next;
    });
  };

  const handlePinnedItemClick = (item: AppMenuItem) => {
    if (!item.route || item.route === routerLocation.pathname) return;
    navigate(item.route);
  };

  const renderPinnedItem = (item: AppMenuItem) => {
    const isActive = item.id === activeItemId;

    return (
      <PinnedAppButton
        key={item.id}
        item={item}
        active={isActive}
        onClick={item.route ? () => handlePinnedItemClick(item) : undefined}
      />
    );
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex items-center border-b border-gray-200 h-12 gap-3 bg-white px-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <SapoLogo />
        {visiblePinnedItems.map(renderPinnedItem)}
      </div>
      {title && (
        <h1 className="text-[15px] font-semibold text-[#1F2937]">{title}</h1>
      )}
      {centerContent}

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
