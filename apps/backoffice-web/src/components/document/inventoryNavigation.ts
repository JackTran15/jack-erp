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
  /** Permission key gating the tab/menu entry — mirrors the route's API guard. */
  permission: string;
}

/** Single source of truth for the inventory top tabs and sidebar submenu. */
export const INVENTORY_NAV_ITEMS: InventoryNavigationItem[] = [
  {
    id: "purchase-orders",
    label: "Nhập kho",
    href: "/inventory/purchase-orders",
    permission: "goods_receipt.read",
  },
  {
    id: "transfer-in",
    label: "Điều chuyển từ cửa hàng khác",
    href: "/inventory/transfer-in",
    permission: "inventory.transfer.import",
  },
  {
    id: "goods-issues",
    label: "Xuất kho",
    href: "/inventory/goods-issues",
    permission: "inventory.goods-issue.read",
  },
  {
    id: "stock-transfer",
    label: "Chuyển kho",
    href: "/inventory/stock-transfers",
    permission: "inventory.transfer.create",
  },
  {
    id: "transfer-order",
    label: "Lệnh điều chuyển",
    href: "/inventory/transfer-orders",
    permission: "inventory.transfer.read",
  },
  {
    id: "stock-take",
    label: "Kiểm kê kho",
    href: "/inventory/stock-takes",
    permission: "inventory.adjustment.create",
  },
  {
    id: "stock-summary",
    label: "Tổng hợp tồn kho",
    href: "/inventory-management",
    permission: "inventory.reports.read",
  },
  {
    id: "item-locations",
    label: "Vị trí hàng hóa",
    href: "/inventory/item-locations",
    permission: "inventory.location.write",
  },
  {
    id: "item-location-details",
    label: "Chi tiết vị trí hàng hóa",
    href: "/inventory/item-location-details",
    permission: "inventory.location.write",
  },
];
