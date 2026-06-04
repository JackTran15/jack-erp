import { Link } from "react-router-dom";
import { PageTabBar, type PageTabItem } from "@erp/ui";
import type { ReactNode } from "react";

export type InventoryTabId =
  | "storages"
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
  { id: "storages", label: "Kho lưu trữ", href: "/inventory/storages" },
  { id: "purchase-orders", label: "Nhập kho", href: "/inventory/purchase-orders" },
  { id: "transfer-in", label: "Điều chuyển từ cửa hàng khác", href: "#", comingSoon: true },
  { id: "goods-issues", label: "Xuất kho", href: "/inventory/goods-issues" },
  { id: "stock-transfer", label: "Chuyển kho", href: "/inventory/stock-transfers" },
  { id: "transfer-order", label: "Lệnh điều chuyển", href: "/inventory/transfer-orders" },
  { id: "stock-take", label: "Kiểm kê kho", href: "/inventory/stock-takes" },
  { id: "stock-summary", label: "Tổng hợp tồn kho", href: "/inventory-management" },
  { id: "item-locations", label: "Vị trí hàng hóa", href: "/inventory/item-locations" },
  { id: "item-location-details", label: "Chi tiết vị trí hàng hóa", href: "/inventory/item-location-details" },
];

export function InventoryTabBar({ activeId }: { activeId: InventoryTabId }) {
  const linkClassName =
    "font-medium text-primary-blue transition-colors hover:text-primary-blue-hover";

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
              {item.label}
            </span>
          );
        }
        return (
          <Link to={item.href ?? "#"} className={linkClassName}>
            {item.label}
          </Link>
        );
      }}
    />
  );
}

export function InventoryPageTitle({ children }: { children: ReactNode }) {
  return <span className="text-xl">{children}</span>;
}
