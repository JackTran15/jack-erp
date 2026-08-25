import { VoucherKind } from "@erp/shared-interfaces";
import { apiClient } from "../api-axios";
import { triggerBlobDownload } from "../download";

/** Export route per voucher kind — mirrors the `print-payload` route it sits beside. */
const EXPORT_PATH: Partial<Record<VoucherKind, (id: string) => string>> = {
  [VoucherKind.GOODS_RECEIPT]: (id) => `/goods-receipts/${id}/export`,
  [VoucherKind.GOODS_ISSUE]: (id) => `/inventory/goods-issues/${id}/export`,
  [VoucherKind.TRANSFER_ORDER]: (id) => `/inventory/transfer-orders/${id}/export`,
};

/**
 * Filename to use when the server's own is unreadable.
 *
 * The API sets `Content-Disposition` and, since the header is exposed to CORS,
 * that is normally what lands on disk. These exist for the case where something
 * between here and the API strips it: a wrong name that nobody notices is the
 * failure this file already had once, when everything downloaded as
 * "chung-tu.xlsx".
 */
const FALLBACK_FILENAME: Partial<Record<VoucherKind, string>> = {
  [VoucherKind.GOODS_RECEIPT]: "phieu-nhap-kho.xlsx",
  [VoucherKind.GOODS_ISSUE]: "phieu-xuat-kho.xlsx",
  [VoucherKind.TRANSFER_ORDER]: "phieu-chuyen-kho.xlsx",
};

/** Read the server-chosen filename; it names the voucher type. */
function filenameFrom(disposition: unknown, fallback: string): string {
  if (typeof disposition !== "string") return fallback;
  const match = /filename="?([^"\n]+)"?/i.exec(disposition);
  return match?.[1]?.trim() || fallback;
}

/** GET one .xlsx route and save it, keeping the server-chosen filename. */
async function downloadXlsx(path: string, fallbackFilename: string): Promise<void> {
  const response = await apiClient.get<Blob>(path, { responseType: "blob" });
  triggerBlobDownload(
    response.data,
    filenameFrom(response.headers?.["content-disposition"], fallbackFilename),
  );
}

/** Download one voucher as .xlsx. One function for all kinds (dispatched by `kind`). */
export async function downloadVoucherExcel(kind: VoucherKind, id: string): Promise<void> {
  const buildPath = EXPORT_PATH[kind];
  if (!buildPath) {
    throw new Error(`Chứng từ chưa hỗ trợ xuất khẩu: ${kind}`);
  }
  await downloadXlsx(buildPath(id), FALLBACK_FILENAME[kind] ?? "chung-tu.xlsx");
}

/**
 * Download a transfer's export XK as .xlsx through the transfer order, so the
 * destination branch can export the source branch's phiếu xuất kho — the
 * branch-scoped goods-issue route 404s there.
 */
export async function downloadTransferExportIssueExcel(
  transferOrderId: string,
): Promise<void> {
  await downloadXlsx(
    `/inventory/transfer-orders/${transferOrderId}/export-goods-issue/export`,
    FALLBACK_FILENAME[VoucherKind.GOODS_ISSUE] ?? "chung-tu.xlsx",
  );
}

/** Mirror of {@link downloadTransferExportIssueExcel} for the import NK. */
export async function downloadTransferImportReceiptExcel(
  transferOrderId: string,
): Promise<void> {
  await downloadXlsx(
    `/inventory/transfer-orders/${transferOrderId}/import-goods-receipt/export`,
    FALLBACK_FILENAME[VoucherKind.GOODS_RECEIPT] ?? "chung-tu.xlsx",
  );
}
