import { ComponentType, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import {
  BellIcon,
  GridIcon,
  IconProps,
  RefreshIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosMenuPopover } from "./PosMenuPopover/PosMenuPopover";
import { PosLocationIndicator } from "./PosLocationIndicator/PosLocationIndicator";
import { PosPinnedButton } from "./PosPinnedButton/PosPinnedButton";
import { PosLogo } from "./PosLogo/PosLogo";
import { PosUserMenu } from "./PosUserMenu/PosUserMenu";
import { APP_MENU_ITEMS } from "@erp/pos/constants/pos-menu.constant";
import {
  useDeleteInvoiceMutation,
  useDraftInvoicesQuery,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { InvoiceTabBar } from "@erp/pos/components/page-components/Checkout/Topbar/InvoiceTabBar/InvoiceTabBar";
import type {
  DraftInvoice,
  InvoiceTabItem,
} from "@erp/pos/interfaces/checkout.interface";
import { DraftInvoicesDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/DraftInvoicesDialog";
import {
  readPinnedItems,
  writePinnedItems,
} from "@erp/pos/lib/common/localstorage";
import { resetAppState } from "@erp/pos/lib/common/reset-app-state";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";
import { authService } from "@erp/pos/services/auth.service";
import { useCurrentUserQuery } from "@erp/pos/hooks/react-query/use-query-user";
import {
  PosNotificationPopover,
  type NotificationItem,
} from "./PosNotificationPopover/PosNotificationPopover";
import { PosSyncDialog } from "./PosSyncDialog/PosSyncDialog";

export interface PosMenuItem {
  id: string;
  label: string;
  /** Squircle background fill. */
  iconBgColor: string;
  Icon: ComponentType<IconProps>;
  /** Present ⇒ click navigates here; otherwise click is a close-only no-op. */
  route?: string;
  /** Present ⇒ click opens this absolute URL in a new tab (e.g. ERP backoffice). */
  externalUrl?: string;
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
export function PosLayout() {
  const routerLocation = useLocation();
  const navigate = useNavigate();

  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const [pinnedItems, setPinnedItems] =
    useState<PosMenuItem[]>(readPinnedItems);
  const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationsTriggerRef = useRef<HTMLButtonElement>(null);

  const notifications = useMemo<NotificationItem[]>(
    () => [
      {
        id: "n1",
        timestamp: "8:05 02/12/2024",
        title: "MISA thông báo v/v khắc phục vấn đề gián đoạn dịch vụ",
        description:
          "MISA thông báo v/v khắc phục vấn đề gián đoạn dịch vụ",
        read: false,
      },
    ],
    [],
  );

  const sessions = usePosCheckoutSessionStore((s) => s.sessions);
  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const posSessionId = usePosCheckoutSessionStore((s) => s.posSessionId);
  const setActiveSessionId = usePosCheckoutSessionStore(
    (s) => s.setActiveSessionId,
  );
  const addSession = usePosCheckoutSessionStore((s) => s.addSession);
  const removeSession = usePosCheckoutSessionStore((s) => s.removeSession);
  const cashierDisplayName = usePosCheckoutSessionStore(
    (s) => s.cashierDisplayName,
  );
  const { data: currentUser } = useCurrentUserQuery();
  const displayName =
    currentUser
      ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
      : (cashierDisplayName ?? "");
  const roleSubtitle = currentUser?.roles.map((r) => r.name).join(", ") ?? undefined;
  const draftsDialogOpen = usePosCheckoutSessionStore(
    (s) => s.draftsDialogOpen,
  );
  const setDraftsDialogOpen = usePosCheckoutSessionStore(
    (s) => s.setDraftsDialogOpen,
  );
  const openDraftInNewSession = usePosCheckoutSessionStore(
    (s) => s.openDraftInNewSession,
  );

  // Badge đếm hóa đơn lưu tạm — body không filter (trùng cache key với dialog
  // khi chưa nhập tìm kiếm). Đếm tối đa 100 (giới hạn 1 trang) — đủ cho draft.
  const draftsQuery = useDraftInvoicesQuery({
    body: { page: 1, limit: 100 },
    sessionId: posSessionId,
    enabled: Boolean(posSessionId),
  });
  const draftsCount = draftsQuery.data?.length ?? 0;
  const deleteInvoiceMutation = useDeleteInvoiceMutation();

  const announcement = usePosCheckoutUiStore((s) => s.announcement);
  const announce = usePosCheckoutUiStore((s) => s.setAnnouncement);

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
      tabs.map((t) => (t.isDraft ? { ...t, badgeCount: draftsCount } : t)),
    [tabs, draftsCount],
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
    // Cho phép đóng cả tab cuối — removeSession sẽ tự tạo lại "Hóa đơn 1" (SALE).
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
    deleteInvoiceMutation.mutate(id, {
      onSuccess: () => {
        announce("Đã xóa hóa đơn lưu tạm.");
      },
    });
  };

  const activeItemId = useMemo(
    () => resolveSelectedPosMenuItemId(routerLocation.pathname),
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

  const handleTogglePin = (item: PosMenuItem) => {
    setPinnedItems((prev) => {
      const next = prev.some((p) => p.id === item.id)
        ? prev.filter((p) => p.id !== item.id)
        : [item, ...prev].slice(0, APP_HEADER_PINNED_ITEM_LIMIT);

      writePinnedItems(next);
      return next;
    });
  };

  const handlePinnedItemClick = (item: PosMenuItem) => {
    if (!item.route || item.route === routerLocation.pathname) return;
    navigate(item.route);
  };

  const handleLogout = () => {
    authService.clearSession();
    resetAppState();
    navigate("/dang-nhap", { replace: true });
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-gray-100 text-gray-900 overflow-hidden">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-200 gap-2 bg-white px-3">
        <div className="flex items-center gap-2">
          <div onClick={() => navigate("/")} className="cursor-pointer">
            <PosLogo />
          </div>
          {visiblePinnedItems.map((item) => {
            const isActive = item.id === activeItemId;
            return (
              <PosPinnedButton
                key={item.id}
                item={item}
                active={isActive}
                onClick={
                  item.route ? () => handlePinnedItemClick(item) : undefined
                }
              />
            );
          })}
        </div>

        {showInvoiceTabs && (
          <InvoiceTabBar
            tabs={tabsWithBadges}
            activeId={activeSessionId}
            onSelect={handleSelectTab}
            onClose={handleCloseTab}
            onAdd={handleAddTab}
          />
        )}

        <div className="ml-auto flex items-center gap-1 py-2">
          <PosLocationIndicator />
          <PosIconButton
            ref={notificationsTriggerRef}
            ariaLabel="Thông báo"
            icon={<BellIcon size={18} />}
            active={notificationsOpen}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            onClick={() => setNotificationsOpen((v) => !v)}
          />
          <PosIconButton
            ariaLabel="Đồng bộ"
            icon={<RefreshIcon size={18} />}
            active={syncDialogOpen}
            onClick={() => setSyncDialogOpen(true)}
          />
          <PosUserMenu
            name={displayName}
            subtitle={roleSubtitle}
            onLogout={handleLogout}
          />
          <PosIconButton
            ref={appMenuTriggerRef}
            ariaLabel="Menu ứng dụng"
            icon={<GridIcon size={18} />}
            active={appMenuOpen}
            aria-expanded={appMenuOpen}
            aria-haspopup="menu"
            onClick={() => setAppMenuOpen((v) => !v)}
          />
          <PosMenuPopover
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
        sessionId={posSessionId}
        onConfirm={handleRestoreDraft}
        onDelete={handleDeleteDraft}
      />

      <PosNotificationPopover
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        triggerRef={notificationsTriggerRef}
        notifications={notifications}
      />

      <PosSyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
      />

      <Outlet />
    </div>
  );
}

const CHECKOUT_PATHS = new Set(["/"]);

export function resolveSelectedPosMenuItemId(pathname: string): string {
  const match = APP_MENU_ITEMS.find(
    (item) =>
      item.route && item.route !== "/" && pathname.startsWith(item.route),
  );
  if (match) return match.id;
  if (CHECKOUT_PATHS.has(pathname)) return "ban-hang";
  return "";
}
