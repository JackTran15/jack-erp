import { cn } from "@erp/ui";
import { ComponentType, useMemo, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { IconButton } from "@erp/pos/features/checkout/components/common/IconButton";
import {
  BellIcon,
  GridIcon,
  IconProps,
  PlusIcon,
  RefreshIcon,
} from "@erp/pos/components/icons/Icon";
import { AppMenuPopover } from "./AppMenuPopover/AppMenuPopover";
import { AppLocationIndicator } from "./AppLocationIndicator/AppLocationIndicator";
import { PinnedAppButton } from "./PinnedAppButton/PinnedAppButton";
import { AppLogo } from "./AppLogo/AppLogo";
import { AppUserMenu } from "./AppUserMenu/AppUserMenu";
import { APP_MENU_ITEMS } from "@erp/pos/constants/pos-menu.constant";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/usePosCheckoutSessionStore";
import { usePosBranchStore } from "@erp/pos/stores/usePosBranchStore";
import { InvoiceTab } from "@erp/pos/features/checkout/components/topbar/InvoiceTab";
import type {
  DraftInvoice,
  InvoiceTabItem,
} from "@erp/pos/features/checkout/components/types";
import { DraftInvoicesDialog } from "@erp/pos/features/checkout/components/draftInvoices/DraftInvoicesDialog";
import { useAnnounce } from "@erp/pos/hooks/useAnnounce";
import { readPinnedItems, writePinnedItems } from "@erp/pos/lib/localstorage";


export interface AppMenuItem {
  id: string;
  label: string;
  /** Squircle background fill. */
  iconBgColor: string;
  Icon: ComponentType<IconProps>;
  /** Present ⇒ click navigates here; otherwise click is a close-only no-op. */
  route?: string;
  badge?: "new";
  /** When true, the popover renders a pin icon at the top-right of the tile. */
  pinnable?: boolean;
}

export const APP_HEADER_PINNED_ITEM_LIMIT = 2;

/**
 * Shared shell header used across POS module pages. Keeps the common right-side
 * controls (location, notify, sync, user, app menu) while callers provide the
 * variable left/center content.
 */
export function AppPosLayout() {
  const routerLocation = useLocation();
  const navigate = useNavigate();

  const [appMenuOpen, setAppMenuOpen] = useState(false);

  const [pinnedItems, setPinnedItems] =
    useState<AppMenuItem[]>(readPinnedItems);
  const appMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const branchName = usePosBranchStore((s) => s.branchName);
  const sessions = usePosCheckoutSessionStore((s) => s.sessions);
  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = usePosCheckoutSessionStore(
    (s) => s.setActiveSessionId,
  );
  const addSession = usePosCheckoutSessionStore((s) => s.addSession);
  const removeSession = usePosCheckoutSessionStore((s) => s.removeSession);
  const draftInvoices = usePosCheckoutSessionStore((s) => s.draftInvoices);
  const cashierDisplayName = usePosCheckoutSessionStore(
    (s) => s.cashierDisplayName,
  );
  const draftsDialogOpen = usePosCheckoutSessionStore(
    (s) => s.draftsDialogOpen,
  );
  const setDraftsDialogOpen = usePosCheckoutSessionStore(
    (s) => s.setDraftsDialogOpen,
  );
  const openDraftInNewSession = usePosCheckoutSessionStore(
    (s) => s.openDraftInNewSession,
  );
  const removeDraft = usePosCheckoutSessionStore((s) => s.removeDraft);

  const { message: announcement, announce } = useAnnounce();

  const tabs = useMemo<InvoiceTabItem[]>(() => {
    const fromSessions = sessions.map((s) => ({
      id: s.id,
      label: s.label,
    }));
    return [
      ...fromSessions,
      { id: "tab-draft", label: "HĐ lưu tạm", isDraft: true },
    ];
  }, [sessions]);

  const tabsWithBadges = useMemo<InvoiceTabItem[]>(
    () =>
      tabs.map((t) =>
        t.isDraft ? { ...t, badgeCount: draftInvoices.length } : t,
      ),
    [tabs, draftInvoices.length],
  );

  const handleSelectTab = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab?.isDraft) {
      setDraftsDialogOpen(true);
      return;
    }
    setActiveSessionId(id);
  };

  const handleCloseTab = (id: string) => {
    if (id === "tab-draft") return;
    if (sessions.length <= 1) return;
    removeSession(id);
  };

  const handleAddTab = () => {
    addSession();
  };

  const handleRestoreDraft = (draft: DraftInvoice) => {
    openDraftInNewSession(draft);
    announce(`Đã tạo hóa đơn mới từ lưu tạm ${draft.invoiceNumber}.`);
  };

  const handleDeleteDraft = (id: string) => {
    removeDraft(id);
    announce("Đã xóa hóa đơn lưu tạm.");
  };

  const activeItemId = useMemo(
    () => resolveSelectedAppMenuItemId(routerLocation.pathname),
    [routerLocation.pathname],
  );

  const showInvoiceTabs = activeItemId === "ban-hang";

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

  return (
    <div className="flex h-screen w-full flex-col bg-gray-100 text-gray-900">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-200 h-12 gap-3 bg-white px-3" >
        <div className="flex items-center gap-2">
          <div onClick={() => navigate('/')} className="cursor-pointer">
            <AppLogo />
          </div>
          {visiblePinnedItems.map(item => {
            const isActive = item.id === activeItemId;
              return <PinnedAppButton
                  key={item.id}
                  item={item}
                  active={isActive}
                  onClick={item.route ? () => handlePinnedItemClick(item) : undefined}
                />
            })}
        </div>

        {showInvoiceTabs && (
          <nav
            aria-label="Hóa đơn"
            className="flex items-end gap-0.5 self-end pl-2"
          >
            {tabsWithBadges.map((tab) => (
              <InvoiceTab
                key={tab.id}
                label={tab.label}
                isActive={tab.id === activeSessionId}
                isDraft={tab.isDraft}
                badgeCount={tab.badgeCount}
                onSelect={() => handleSelectTab(tab.id)}
                onClose={() => handleCloseTab(tab.id)}
              />
            ))}
            <IconButton
              ariaLabel="Thêm hóa đơn"
              icon={<PlusIcon size={16} />}
              onClick={handleAddTab}
              className="mb-1"
            />
          </nav>
        )}

         <div className="ml-auto flex items-center gap-1">
            <AppLocationIndicator location={branchName ?? 'Main brain'} />
            <IconButton ariaLabel="Thông báo" icon={<BellIcon size={18} />} />
            <IconButton ariaLabel="Đồng bộ" icon={<RefreshIcon size={18} />} />
            <AppUserMenu name={cashierDisplayName ?? 'Phan Thanh Hà'} />
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

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      <DraftInvoicesDialog
        open={draftsDialogOpen}
        onClose={() => setDraftsDialogOpen(false)}
        drafts={draftInvoices}
        onConfirm={handleRestoreDraft}
        onDelete={handleDeleteDraft}
      />

      <Outlet/>
    </div>
  );
}

const CHECKOUT_PATHS = new Set(["/"]);

export function resolveSelectedAppMenuItemId(pathname: string): string {
  const match = APP_MENU_ITEMS.find(
    (item) => item.route && item.route !== "/" && pathname.startsWith(item.route),
  );
  if (match) return match.id;
  if (CHECKOUT_PATHS.has(pathname)) return "ban-hang";
  return "";
}
