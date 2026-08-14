import { PurchaseHistoryStatusEnum } from "@erp/pos/constants/checkout.constant";
import type { PurchaseHistoryStatus } from "@erp/pos/constants/checkout.constant";
import { getInvoiceSignedTotal } from "@erp/pos/lib/common/invoiceAmount";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { PurchaseHistoryEntry } from "@erp/pos/interfaces/customer-detail.interface";

/**
 * Map hoá đơn của một khách sang dòng lịch sử mua hàng. **Không loại dòng nào**:
 * server đã lọc `isDraft = false` và whitelist trạng thái
 * paid/debt/partial_debt/cancelled, nên lọc lại ở đây chỉ khiến "Tổng hóa đơn:
 * {total}" (số của server) và tiền ở footer nói về hai tập khác nhau.
 * Trạng thái nằm ngoài bảng nhãn UI trả `null` — dòng vẫn hiện, ô trạng thái để
 * trống.
 *
 * `storeName` lấy từ `inv.branch.name` (BE join trả inline); fallback `branchName`
 * khi thiếu. "Tổng thanh toán" dùng `getInvoiceSignedTotal`: đơn bán (kể cả ghi
 * nợ) = `amountDue` (tổng hoá đơn, không phải số đã trả nên đơn nợ không ra 0);
 * đơn đổi/trả (RETURN/EXCHANGE) = `netAmount` có dấu (âm = hoàn tiền khách).
 */
const STATUS_MAP: Partial<Record<InvoiceRow["status"], PurchaseHistoryStatus>> = {
  paid: PurchaseHistoryStatusEnum.PAID,
  debt: PurchaseHistoryStatusEnum.DEBT,
  partial_debt: PurchaseHistoryStatusEnum.DEBT,
  cancelled: PurchaseHistoryStatusEnum.CANCELLED,
};

export function mapInvoicesToPurchaseHistory(
  invoices: ReadonlyArray<InvoiceRow>,
  branchName: string | null,
): PurchaseHistoryEntry[] {
  const rows: PurchaseHistoryEntry[] = [];
  for (const inv of invoices) {
    rows.push({
      id: inv.id,
      invoiceDate: new Date(inv.issuedAt ?? inv.createdAt),
      invoiceNumber: inv.code,
      storeName: inv.branch?.name ?? branchName ?? "",
      status: STATUS_MAP[inv.status] ?? null,
      totalAmount: getInvoiceSignedTotal(inv),
      note: inv.note,
    });
  }
  return rows;
}
