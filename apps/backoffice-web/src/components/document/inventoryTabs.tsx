import { Link } from "react-router-dom";
import { PageTabBar, type PageTabItem } from "@erp/ui";
import type { ReactNode } from "react";
import { useImportableTransferOrderCount } from "../../hooks/useImportableTransferOrderCount";

export type InventoryTabId =
  | "purchase-orders"
  | "transfer-in"
  | "goods-issues"
  | "stock-transfer"
  | "transfer-order"
  | "stock-take"
  | "stock-summary"
  | "item-locations"
  | "item-location-details";

export const INVENTORY_TABS: (PageTabItem & {
  id: InventoryTabId;
  /** Pages that aren't built yet are rendered as disabled placeholders. */
  comingSoon?: boolean;
})[] = [
  { id: "purchase-orders", label: "Nhập kho", href: "/inventory/purchase-orders" },
  { id: "transfer-in", label: "Điều chuyển từ cửa hàng khác", href: "/inventory/transfer-in" },
  { id: "goods-issues", label: "Xuất kho", href: "/inventory/goods-issues" },
  { id: "stock-transfer", label: "Chuyển kho", href: "/inventory/stock-transfers" },
  { id: "transfer-order", label: "Lệnh điều chuyển", href: "/inventory/transfer-orders" },
  { id: "stock-take", label: "Kiểm kê kho", href: "/inventory/stock-takes" },
  { id: "stock-summary", label: "Tổng hợp tồn kho", href: "/inventory-management" },
  { id: "item-locations", label: "Vị trí hàng hóa", href: "/inventory/item-locations" },
  { id: "item-location-details", label: "Chi tiết vị trí hàng hóa", href: "/inventory/item-location-details" },
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
