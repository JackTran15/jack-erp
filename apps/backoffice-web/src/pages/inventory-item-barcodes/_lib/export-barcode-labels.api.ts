import { apiClient } from "../../../lib/api-axios";
import { triggerBlobDownload } from "../../../lib/download";
import type { BarcodeLabelRow } from "./barcode-label-row.type";

/**
 * Xuất khẩu danh sách hàng hoá in tem ra Excel. File được dựng ở backend —
 * client chỉ gửi itemId + số lượng in, các cột còn lại backend tự bổ sung.
 */
export async function downloadBarcodeLabelsExcel(
  rows: BarcodeLabelRow[],
): Promise<void> {
  const { data } = await apiClient.post<Blob>(
    "/inventory/exports/barcode-labels/excel",
    { rows: rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })) },
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "danh-sach-hang-hoa-in-tem.xlsx");
}
