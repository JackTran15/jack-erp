import type { NavigateFunction } from "react-router-dom";

/** Route trang In tem mã. */
export const BARCODE_PRINT_ROUTE = "/admin/inventory-item-barcodes";

/** Một hàng hóa đổ sẵn vào bảng in tem từ trang nguồn. */
export interface BarcodePrefillItem {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: number;
  quantity?: number;
  storageId?: string;
  storageName?: string;
  locationId?: string;
  locationCode?: string;
}

/** State điều hướng vào trang In tem mã (React Router `location.state`). */
export interface BarcodePrintNavState {
  /** Route trang nguồn để nút "Hủy bỏ" quay lại. */
  from: string;
  /** Hàng hóa đổ sẵn (nếu vào từ nút "In tem mã" có chọn hàng). */
  items?: BarcodePrefillItem[];
}

/** Điều hướng sang trang In tem mã, kèm trang nguồn + hàng hóa đổ sẵn (tùy chọn). */
export function navigateToBarcodePrint(
  navigate: NavigateFunction,
  from: string,
  items?: BarcodePrefillItem[],
): void {
  navigate(BARCODE_PRINT_ROUTE, {
    state: { from, items } satisfies BarcodePrintNavState,
  });
}

/** Đọc & kiểm tra `location.state` của trang In tem mã. */
export function readBarcodePrintNavState(
  state: unknown,
): BarcodePrintNavState | null {
  if (!state || typeof state !== "object") return null;
  const s = state as Partial<BarcodePrintNavState>;
  if (typeof s.from !== "string") return null;
  return { from: s.from, items: Array.isArray(s.items) ? s.items : undefined };
}
