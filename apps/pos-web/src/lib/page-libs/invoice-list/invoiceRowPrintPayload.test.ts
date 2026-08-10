import { describe, expect, it } from "vitest";
import { PromotionProgramType } from "@erp/shared-interfaces";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";

import { buildInvoiceRowPrintPayload } from "@erp/pos/lib/page-libs/invoice-list/invoiceRowPrintPayload";

/**
 * T-08-04 — breakdown "KM theo hoá đơn"/"KM theo mặt hàng" khi in lại hóa
 * đơn, cùng bộ case với T-08-03 (hóa đơn vừa thanh toán) — hai builder phải
 * cho cùng kết quả trên cùng dữ liệu.
 */
describe("buildInvoiceRowPrintPayload — promotion breakdown", () => {
  const baseInvoice: InvoiceRow = {
    id: "inv-1",
    code: "HD000001",
    status: "paid",
    isDraft: false,
    sessionId: "session-1",
    staffId: "staff-1",
    subtotal: 685_000,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 685_000,
    totalPaid: 685_000,
    netAmount: 0,
    createdAt: "2026-08-10T00:00:00.000Z",
    items: [
      {
        id: "item-row-1",
        itemId: "item-1",
        itemCode: "SKU-1",
        itemName: "Giày nam",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 685_000,
        lineDiscount: 0,
        lineTotal: 685_000,
      },
    ],
  };

  it("has no discount rows when there is no manual discount and no promotion", () => {
    const payload = buildInvoiceRowPrintPayload(baseInvoice);
    expect(payload.totals.manualDiscountTotal).toBeUndefined();
    expect(payload.totals.itemDiscountTotal).toBeUndefined();
    expect(payload.totals.invoiceDiscountTotal).toBeUndefined();
  });

  it("manual line discount only ⇒ 'Giảm giá', not 'KM theo mặt hàng'", () => {
    const invoice: InvoiceRow = {
      ...baseInvoice,
      items: [{ ...baseInvoice.items![0], lineDiscount: 50_000 }],
    };
    const payload = buildInvoiceRowPrintPayload(invoice);
    expect(payload.totals.manualDiscountTotal).toBe(50_000);
    expect(payload.totals.itemDiscountTotal).toBeUndefined();
  });

  it("ITEM_DISCOUNT promotion only ⇒ 'KM theo mặt hàng', not 'Giảm giá'", () => {
    const invoice: InvoiceRow = {
      ...baseInvoice,
      appliedPromotions: [
        { type: PromotionProgramType.ITEM_DISCOUNT, discountAmount: 205_500 },
      ],
    };
    const payload = buildInvoiceRowPrintPayload(invoice);
    expect(payload.totals.itemDiscountTotal).toBe(205_500);
    expect(payload.totals.manualDiscountTotal).toBeUndefined();
    expect(payload.totals.invoiceDiscountTotal).toBeUndefined();
  });

  it("INVOICE_DISCOUNT promotion only ⇒ 'KM theo hoá đơn'", () => {
    const invoice: InvoiceRow = {
      ...baseInvoice,
      appliedPromotions: [
        { type: PromotionProgramType.INVOICE_DISCOUNT, discountAmount: 100_000 },
      ],
    };
    const payload = buildInvoiceRowPrintPayload(invoice);
    expect(payload.totals.invoiceDiscountTotal).toBe(100_000);
    expect(payload.totals.itemDiscountTotal).toBeUndefined();
  });

  it("manual discount + promotion together ⇒ two separate lines, never summed", () => {
    const invoice: InvoiceRow = {
      ...baseInvoice,
      items: [{ ...baseInvoice.items![0], lineDiscount: 50_000 }],
      appliedPromotions: [
        { type: PromotionProgramType.INVOICE_DISCOUNT, discountAmount: 100_000 },
      ],
    };
    const payload = buildInvoiceRowPrintPayload(invoice);
    expect(payload.totals.manualDiscountTotal).toBe(50_000);
    expect(payload.totals.invoiceDiscountTotal).toBe(100_000);
  });

  it("GIFT_ITEM promotion is excluded from both promotion buckets, even alongside a real discount", () => {
    // T-08-05 regression: discountAmount: 0 would pass even without the
    // exclusion branch — pair a nonzero GIFT_ITEM with an ITEM_DISCOUNT so a
    // leak would show up as a wrong itemDiscountTotal, not just a missing one.
    const invoice: InvoiceRow = {
      ...baseInvoice,
      appliedPromotions: [
        { type: PromotionProgramType.GIFT_ITEM, discountAmount: 15_000 },
        { type: PromotionProgramType.ITEM_DISCOUNT, discountAmount: 10_000 },
      ],
    };
    const payload = buildInvoiceRowPrintPayload(invoice);
    expect(payload.totals.itemDiscountTotal).toBe(10_000);
    expect(payload.totals.invoiceDiscountTotal).toBeUndefined();
  });
});
