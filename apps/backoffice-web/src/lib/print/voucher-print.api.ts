import { VoucherKind, VoucherPrintPayload } from "@erp/shared-interfaces";
import { apiClient } from "../api-axios";

/** Print-payload route per voucher kind — mirrors the `GET :id` route it sits beside. */
const PRINT_PAYLOAD_PATH: Partial<Record<VoucherKind, (id: string) => string>> = {
  [VoucherKind.GOODS_RECEIPT]: (id) => `/goods-receipts/${id}/print-payload`,
  [VoucherKind.GOODS_ISSUE]: (id) => `/inventory/goods-issues/${id}/print-payload`,
  [VoucherKind.TRANSFER_ORDER]: (id) => `/inventory/transfer-orders/${id}/print-payload`,
};

/**
 * Fetch the print-ready payload for one voucher. One function for all kinds
 * (dispatched by `kind`) so callers don't rebuild the route per dialog.
 */
export async function fetchVoucherPrintPayload(
  kind: VoucherKind,
  id: string,
): Promise<VoucherPrintPayload> {
  const buildPath = PRINT_PAYLOAD_PATH[kind];
  if (!buildPath) {
    throw new Error(`Chứng từ chưa hỗ trợ in: ${kind}`);
  }
  const response = await apiClient.get<VoucherPrintPayload>(buildPath(id));
  return response.data;
}

/**
 * Print payload for a transfer's export XK, resolved through the transfer order so
 * the destination branch can print the source branch's phiếu xuất kho — the
 * branch-scoped goods-issue route 404s there.
 */
export async function fetchTransferExportIssuePrintPayload(
  transferOrderId: string,
): Promise<VoucherPrintPayload> {
  const response = await apiClient.get<VoucherPrintPayload>(
    `/inventory/transfer-orders/${transferOrderId}/export-goods-issue/print-payload`,
  );
  return response.data;
}

/** Mirror of {@link fetchTransferExportIssuePrintPayload} for the import NK. */
export async function fetchTransferImportReceiptPrintPayload(
  transferOrderId: string,
): Promise<VoucherPrintPayload> {
  const response = await apiClient.get<VoucherPrintPayload>(
    `/inventory/transfer-orders/${transferOrderId}/import-goods-receipt/print-payload`,
  );
  return response.data;
}
