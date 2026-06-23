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

export interface InventoryNavigationItem {
  id: InventoryTabId;
  label: string;
  href: string;
}

/** Single source of truth for the inventory top tabs and sidebar submenu. */
export const INVENTORY_NAV_ITEMS: InventoryNavigationItem[] = [
  {
    id: "purchase-orders",
    label: "Nhập kho",
    href: "/inventory/purchase-orders",
  },
  {
    id: "transfer-in",
    label: "Điều chuyển từ cửa hàng khác",
    href: "/inventory/transfer-in",
  },
  {
    id: "goods-issues",
    label: "Xuất kho",
    href: "/inventory/goods-issues",
  },
  {
    id: "stock-transfer",
    label: "Chuyển kho",
    href: "/inventory/stock-transfers",
  },
  {
    id: "transfer-order",
    label: "Lệnh điều chuyển",
    href: "/inventory/transfer-orders",
  },
  {
    id: "stock-take",
    label: "Kiểm kê kho",
    href: "/inventory/stock-takes",
  },
  {
    id: "stock-summary",
    label: "Tổng hợp tồn kho",
    href: "/inventory-management",
  },
  {
    id: "item-locations",
    label: "Vị trí hàng hóa",
    href: "/inventory/item-locations",
  },
  {
    id: "item-location-details",
    label: "Chi tiết vị trí hàng hóa",
    href: "/inventory/item-location-details",
  },
];
