import { apiClient } from "../../../lib/api-axios";

/** Kho có tồn của một hàng hóa. `code` (mã kho) join từ danh sách kho ở page. */
export interface ItemStorageOption {
  storageId: string;
  storageName: string;
  code: string;
}

/** Vị trí có tồn của một hàng hóa trong một kho. */
export interface ItemLocationOption {
  locationId: string;
  code: string;
  name: string;
}

/** Một dòng tồn (item × vị trí) đã chuẩn hoá từ GET /inventory/stock/balances. */
interface ItemStockBalance {
  storageId: string;
  storageName: string;
  locationId: string;
  code: string;
  name: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Row trả về từ GET /inventory/stock/balances (chỉ khai báo phần đang dùng). */
interface StockBalanceSummaryRow {
  location: {
    id: string;
    code: string;
    name: string;
    storageId: string;
    storageName: string;
  };
}

/**
 * Lấy toàn bộ tồn của một hàng hóa (mọi kho + vị trí) trong chi nhánh hiện tại.
 * `apiClient` tự gắn header `X-Branch-Id`; `branchId` truyền thêm để khớp scope.
 */
export async function fetchItemStockBalances(
  itemId: string,
  branchId?: string | null,
): Promise<ItemStockBalance[]> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "100",
    itemId,
  });
  if (branchId) params.set("branchId", branchId);
  const { data } = await apiClient.get<
    PaginatedResponse<StockBalanceSummaryRow>
  >(`/inventory/stock/balances?${params}`);
  return data.data.map((row) => ({
    storageId: row.location.storageId,
    storageName: row.location.storageName,
    locationId: row.location.id,
    code: row.location.code,
    name: row.location.name,
  }));
}

/**
 * Gom các dòng tồn thành danh sách kho (distinct theo `storageId`).
 * `code` (mã kho) để rỗng — page gắn từ danh sách kho `/inventory/storages`.
 */
export function toStorageOptions(
  balances: ItemStockBalance[],
): ItemStorageOption[] {
  const byStorage = new Map<string, ItemStorageOption>();
  for (const b of balances) {
    if (!byStorage.has(b.storageId)) {
      byStorage.set(b.storageId, {
        storageId: b.storageId,
        storageName: b.storageName,
        code: "",
      });
    }
  }
  return [...byStorage.values()];
}

/** Lọc các vị trí có tồn của hàng hóa trong một kho cụ thể. */
export function toLocationOptions(
  balances: ItemStockBalance[],
  storageId: string,
): ItemLocationOption[] {
  return balances
    .filter((b) => b.storageId === storageId)
    .map((b) => ({
      locationId: b.locationId,
      code: b.code,
      name: b.name,
    }));
}
