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
 * `InvoiceRow` (`POST /v2/invoices/returnable/search`) → dòng hiển thị bảng đổi
 * trả. `customer` + `branchName` nay được BE trả inline (join), không cần enrich
 * riêng. "Tổng thanh toán" = `totalPaid` (về dạng string nên `Number(...)`).
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
    customerId: inv.customerId ?? null,
    customerName: customer?.name ?? "",
    customerPhone: customer?.phone ?? "",
    totalAmount: Number(inv.totalPaid) || 0,
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
