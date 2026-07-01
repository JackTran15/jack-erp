import type {
  InvoiceListRow,
  InvoiceRow,
} from "@erp/pos/interfaces/invoice.interface";
import { getInvoiceSignedTotal } from "@erp/pos/lib/common/invoiceAmount";

/** Thông tin khách dùng để enrich mã/tên/SĐT trên bảng (từ `customerService.get`). */
export interface InvoiceListRowCustomer {
  code?: string | null;
  name?: string | null;
  phone?: string | null;
}

/**
 * `InvoiceRow` (`GET /invoices`) → dòng hiển thị bảng "Danh sách hóa đơn".
 * `customer` enrich riêng vì endpoint danh sách chỉ trả `customerId`.
 * `amount` có dấu: RETURN/EXCHANGE dùng `netAmount` (âm = hoàn tiền khách), còn lại `amountDue`
 * (xem `getInvoiceSignedTotal`).
 */
export function mapInvoiceToListRow(
  inv: InvoiceRow,
  customer: InvoiceListRowCustomer | null,
): InvoiceListRow {
  return {
    id: inv.id,
    code: inv.code,
    type: inv.type,
    status: inv.status,
    issuedAt: inv.issuedAt ?? null,
    createdAt: inv.createdAt,
    customerId: inv.customerId ?? null,
    customerCode: customer?.code ?? "",
    customerName: customer?.name ?? "",
    customerPhone: customer?.phone ?? "",
    amount: getInvoiceSignedTotal(inv),
    note: inv.note ?? "",
  };
}
