import type { CartLine } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import type { ReturnInvoiceRow } from "./return-goods.types";

/**
 * Build checkout lines for invoice-return checkout (`CheckoutVariant.InvoiceReturn`) from the
 * return-goods dialog selection.
 */
export function buildInvoiceReturnCartLines(
  invoice: ReturnInvoiceRow,
  selectedIds: ReadonlySet<string>,
  qtyById: Readonly<Record<string, number>>,
): CartLine[] {
  const lines: CartLine[] = [];
  for (const item of invoice.items) {
    if (!selectedIds.has(item.id)) continue;
    const q = Math.floor(qtyById[item.id] ?? 0);
    if (q <= 0) continue;
    lines.push({
      lineId: crypto.randomUUID(),
      itemId: `ret-${invoice.id}-${item.id}`,
      name: item.name,
      code: item.code,
      unit: "Cái",
      unitPrice: item.unitPrice,
      qty: q,
      locationId: "",
      maxQty: item.allowedQty,
      isReturnCredit: true,
    });
  }
  return lines;
}
