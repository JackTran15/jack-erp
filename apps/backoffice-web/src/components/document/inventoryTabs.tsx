import { Link } from "react-router-dom";
import { PageTabBar, type PageTabItem } from "@erp/ui";
import type { ReactNode } from "react";
import { useImportableTransferOrderCount } from "../../hooks/useImportableTransferOrderCount";
import {
  INVENTORY_NAV_ITEMS,
  type InventoryTabId,
} from "./inventoryNavigation";

export type { InventoryTabId } from "./inventoryNavigation";

export const INVENTORY_TABS: (PageTabItem & {
  id: InventoryTabId;
  /** Pages that aren't built yet are rendered as disabled placeholders. */
  comingSoon?: boolean;
})[] = [
  ...INVENTORY_NAV_ITEMS,
];

export function InventoryTabBar({ activeId }: { activeId: InventoryTabId }) {
  const transferInCountQuery = useImportableTransferOrderCount();

  const linkClassName =
    "font-medium text-primary-blue transition-colors hover:text-primary-blue-hover";
  const renderLabel = (item: PageTabItem) => {
    const count = item.id === "transfer-in" ? (transferInCountQuery.data ?? 0) : 0;
    if (count <= 0) return item.label;
    return (
      <span className="inline-flex items-center gap-1.5">
        {item.label}
        <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold leading-none text-destructive-foreground">
          {count}
        </span>
      </span>
    );
  };

  return (
    <PageTabBar
      activeId={activeId}
      items={INVENTORY_TABS}
      renderItem={(item, isActive) => {
        // Ẩn tab đang active khỏi thanh nav — chỉ hiện các trang khác.
        if (isActive) {
          return null;
        }
        const tab = item as (typeof INVENTORY_TABS)[number];
        if (tab.comingSoon) {
          return (
            <span
              className="cursor-not-allowed font-medium text-primary-blue/60"
              title="Sắp triển khai"
            >
              {renderLabel(item)}
            </span>
          );
        }
        return (
          <Link to={item.href ?? "#"} className={linkClassName}>
            {renderLabel(item)}
          </Link>
        );
      }}
    />
  );
}

export function InventoryPageTitle({ children }: { children: ReactNode }) {
  return <span className="text-xl">{children}</span>;
}
