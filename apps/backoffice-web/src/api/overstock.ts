import { apiClient } from "../lib/api-axios";

/** Một dòng hiện trong hộp thoại "Xác nhận xuất quá số lượng tồn". */
export interface OverstockWarningRow {
  itemId: string;
  itemName: string;
  availableQuantity: number;
  unit: string;
  storageName: string;
}

/**
 * Một dòng phiếu cần đối chiếu tồn. `locationId` cho tồn tại đúng vị trí đó;
 * dòng chưa chọn Vị trí thì đưa `storageId` và tồn là tổng cả kho — đúng con số
 * người dùng nhìn thấy trên phiếu.
 */
export interface OverstockRequest {
  itemId: string;
  itemName: string;
  unit: string;
  storageName: string;
  quantity: number;
  locationId?: string;
  storageId?: string;
}

interface BatchBalanceRow {
  itemId: string;
  locationId: string | null;
  storageId: string | null;
  quantity: number;
}

/**
 * Những dòng đang xuất quá tồn, để dựng `OverstockConfirmDialog`. Mảng rỗng =
 * không có gì phải cảnh báo.
 *
 * Các dòng cùng (mặt hàng, phạm vi) được cộng lại trước khi so — hai dòng cùng
 * mã cùng kho, mỗi dòng 2 trên tồn 3, là xuất quá tồn dù riêng lẻ dòng nào cũng
 * đủ. Toàn bộ đi trong **một** request `POST /inventory/stock/balances/batch`,
 * nên một phiếu vài trăm dòng vẫn là một round-trip và không có chuyện phân
 * trang cắt mất vị trí.
 *
 * Chỉ cảnh báo, không chặn: sổ kho cho phép âm, người dùng bấm "Tiếp tục" là ghi.
 */
export async function findOverstockRows(
  requests: OverstockRequest[],
): Promise<OverstockWarningRow[]> {
  const byKey = new Map<string, OverstockRequest>();
  for (const request of requests) {
    const key = `${request.itemId}::${request.locationId ?? request.storageId ?? ""}`;
    const current = byKey.get(key);
    byKey.set(
      key,
      current
        ? { ...current, quantity: current.quantity + Number(request.quantity) }
        : { ...request, quantity: Number(request.quantity) },
    );
  }

  const aggregated = [...byKey.values()];
  if (aggregated.length === 0) return [];

  const { data } = await apiClient.post<{ data: BatchBalanceRow[] }>(
    "/inventory/stock/balances/batch",
    {
      pairs: aggregated.map((request) => ({
        itemId: request.itemId,
        locationId: request.locationId || undefined,
        storageId: request.locationId ? undefined : request.storageId || undefined,
      })),
    },
  );

  // The endpoint answers in the order it was asked, one row per pair.
  return aggregated.flatMap((request, idx) => {
    const availableQuantity = Number(data.data[idx]?.quantity ?? 0);
    if (request.quantity <= availableQuantity) return [];
    return [
      {
        itemId: request.itemId,
        itemName: request.itemName,
        availableQuantity,
        unit: request.unit,
        storageName: request.storageName,
      },
    ];
  });
}
