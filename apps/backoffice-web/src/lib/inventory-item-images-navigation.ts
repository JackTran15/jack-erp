import type { NavigateFunction } from "react-router-dom";

/** Route trang Cập nhật ảnh (Danh mục > Hàng hoá > Tiện ích). */
export const INVENTORY_ITEM_IMAGES_ROUTE = "/admin/inventory-items/images";

/** Route trang Cập nhật ảnh nhanh (thả file đặt tên theo mã SKU). */
export const QUICK_IMAGE_UPDATE_ROUTE = "/admin/inventory-items/images/quick";

/** Điều hướng sang trang Cập nhật ảnh. */
export function navigateToInventoryItemImages(navigate: NavigateFunction): void {
  navigate(INVENTORY_ITEM_IMAGES_ROUTE);
}

/** Điều hướng sang trang Cập nhật ảnh nhanh. */
export function navigateToQuickImageUpdate(navigate: NavigateFunction): void {
  navigate(QUICK_IMAGE_UPDATE_ROUTE);
}
