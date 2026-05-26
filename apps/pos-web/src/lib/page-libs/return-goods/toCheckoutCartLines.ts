import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import type { ReturnableItem } from "@erp/pos/interfaces/return-goods.interface";

/**
 * Build checkout lines for invoice-return checkout (`CheckoutVariant.InvoiceReturn`)
 * from the return-goods dialog selection. Mỗi dòng giữ `itemId` / `locationId`
 * thật (từ `eligible-returns`) + `originalInvoiceItemId` để BE cộng đúng
 * `returned_quantity` của hóa đơn gốc. `isReturnCredit` đánh dấu hiệu ứng âm.
 */
export function buildInvoiceReturnCartLines(
  items: ReadonlyArray<ReturnableItem>,
  selectedIds: ReadonlySet<string>,
  qtyById: Readonly<Record<string, number>>,
): CartLine[] {
  const lines: CartLine[] = [];
  for (const item of items) {
    if (!selectedIds.has(item.id)) continue;
    const q = Math.floor(qtyById[item.id] ?? 0);
    if (q <= 0) continue;
    lines.push({
      lineId: crypto.randomUUID(),
      itemId: item.itemId,
      name: item.name,
      code: item.code,
      unit: item.unit || "Cái",
      unitPrice: item.unitPrice,
      qty: q,
      locationId: item.locationId ?? "",
      maxQty: item.allowedQty,
      isReturnCredit: true,
      originalInvoiceItemId: item.id,
    });
  }
  return lines;
}
