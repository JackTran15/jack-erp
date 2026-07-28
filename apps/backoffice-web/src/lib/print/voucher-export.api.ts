import { VoucherKind } from "@erp/shared-interfaces";
import { apiClient } from "../api-axios";
import { triggerBlobDownload } from "../download";

/** Export route per voucher kind — mirrors the `print-payload` route it sits beside. */
const EXPORT_PATH: Partial<Record<VoucherKind, (id: string) => string>> = {
  [VoucherKind.GOODS_RECEIPT]: (id) => `/goods-receipts/${id}/export`,
  [VoucherKind.GOODS_ISSUE]: (id) => `/inventory/goods-issues/${id}/export`,
  [VoucherKind.TRANSFER_ORDER]: (id) => `/inventory/transfer-orders/${id}/export`,
};

/** Read the server-chosen filename; it already carries the voucher's document number. */
function filenameFrom(disposition: unknown, fallback: string): string {
  if (typeof disposition !== "string") return fallback;
  const match = /filename="?([^"\n]+)"?/i.exec(disposition);
  return match?.[1]?.trim() || fallback;
}

/** Download one voucher as .xlsx. One function for all kinds (dispatched by `kind`). */
export async function downloadVoucherExcel(kind: VoucherKind, id: string): Promise<void> {
  const buildPath = EXPORT_PATH[kind];
  if (!buildPath) {
    throw new Error(`Chứng từ chưa hỗ trợ xuất khẩu: ${kind}`);
  }
  const response = await apiClient.get<Blob>(buildPath(id), { responseType: "blob" });
  triggerBlobDownload(
    response.data,
    filenameFrom(response.headers?.["content-disposition"], "chung-tu.xlsx"),
  );
}
