import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type {
  EligibleReturnLine,
  ReturnInvoiceRow,
  ReturnableItem,
} from "@erp/pos/interfaces/return-goods.interface";

/** Thông tin khách dùng để enrich tên/sđt trên bảng (từ `customerService.get`). */
export interface ReturnRowCustomer {
  name?: string | null;
  phone?: string | null;
}

/**
 * `InvoiceRow` (`GET /invoices`) → dòng hiển thị bảng đổi trả. `branchName` lấy
 * từ branch store (POS chỉ scope 1 chi nhánh); `customer` enrich riêng vì
 * endpoint danh sách chỉ trả `customerId`. `amountDue` về dạng string nên `Number(...)`.
 */
export function mapInvoiceToReturnRow(
  inv: InvoiceRow,
  customer: ReturnRowCustomer | null,
  branchName: string,
): ReturnInvoiceRow {
  const issued = inv.issuedAt ?? inv.createdAt;
  return {
    id: inv.id,
    invoiceNumber: inv.code,
    createdAt: new Date(issued),
    customerName: customer?.name ?? "",
    customerPhone: customer?.phone ?? "",
    totalAmount: Number(inv.amountDue) || 0,
    branchName,
  };
}

/** `EligibleReturnLine` (`GET /invoices/:id/eligible-returns`) → dòng chọn trả. */
export function mapEligibleLineToReturnableItem(
  line: EligibleReturnLine,
): ReturnableItem {
  return {
    id: line.originalInvoiceItemId,
    itemId: line.itemId,
    code: line.itemCode,
    name: line.itemName,
    unit: line.unit,
    locationId: line.locationId,
    unitPrice: Number(line.unitPrice) || 0,
    allowedQty: Number(line.maxReturnable) || 0,
  };
}
