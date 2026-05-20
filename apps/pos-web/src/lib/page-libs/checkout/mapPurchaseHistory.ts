import { PurchaseHistoryStatusEnum } from "@erp/pos/constants/checkout.constant";
import type { PurchaseHistoryStatus } from "@erp/pos/constants/checkout.constant";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { PurchaseHistoryEntry } from "@erp/pos/interfaces/customer-detail.interface";

/**
 * Map các invoice trạng thái "đã hoàn tất" của một khách sang dòng lịch sử mua
 * hàng. Chỉ giữ hoá đơn không phải draft và có trạng thái paid/debt/partial_debt
 * (loại draft/pending/cancelled — không phải giao dịch mua hoàn tất).
 *
 * `storeName` lấy theo tên chi nhánh hiện tại vì `GET /invoices` bị scope theo
 * `X-Branch-Id` (response không kèm tên chi nhánh).
 */
const STATUS_MAP: Partial<Record<InvoiceRow["status"], PurchaseHistoryStatus>> = {
  paid: PurchaseHistoryStatusEnum.PAID,
  debt: PurchaseHistoryStatusEnum.DEBT,
  partial_debt: PurchaseHistoryStatusEnum.DEBT,
};

export function mapInvoicesToPurchaseHistory(
  invoices: ReadonlyArray<InvoiceRow>,
  branchName: string | null,
): PurchaseHistoryEntry[] {
  const rows: PurchaseHistoryEntry[] = [];
  for (const inv of invoices) {
    if (inv.isDraft) continue;
    const status = STATUS_MAP[inv.status];
    if (!status) continue;
    rows.push({
      id: inv.id,
      invoiceDate: new Date(inv.issuedAt ?? inv.createdAt),
      invoiceNumber: inv.code,
      storeName: branchName ?? "",
      status,
      totalAmount: inv.amountDue,
      note: inv.note,
    });
  }
  return rows;
}
