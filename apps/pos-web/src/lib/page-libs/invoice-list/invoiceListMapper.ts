import type {
  InvoiceListRow,
  InvoiceRow,
} from "@erp/pos/interfaces/invoice.interface";

/** Thông tin khách dùng để enrich mã/tên/SĐT trên bảng (từ `customerService.get`). */
export interface InvoiceListRowCustomer {
  code?: string | null;
  name?: string | null;
  phone?: string | null;
}

/**
 * `InvoiceRow` (`GET /invoices`) → dòng hiển thị bảng "Danh sách hóa đơn".
 * `customer` enrich riêng vì endpoint danh sách chỉ trả `customerId`.
 * `amount` hiển thị âm cho đơn trả (quy ước hiển thị, dễ chỉnh nếu BE đổi sign).
 */
export function mapInvoiceToListRow(
  inv: InvoiceRow,
  customer: InvoiceListRowCustomer | null,
): InvoiceListRow {
  const due = Number(inv.amountDue) || 0;
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
    amount: inv.type === "RETURN" ? -due : due,
    note: inv.note ?? "",
  };
}
