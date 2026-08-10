import { describe, expect, it } from "vitest";
import { PromotionProgramType } from "@erp/shared-interfaces";

import {
  groupPromotionsForPrint,
  type PromotionAmount,
} from "@erp/pos/lib/page-libs/checkout/printing/promotionPrintBuckets";

/**
 * T-08-02 — gom CTKM đã áp thành "KM theo hoá đơn" / "KM theo mặt hàng" cho
 * hóa đơn in. Dùng chung cho hóa đơn vừa thanh toán (T-08-03) và in lại
 * (T-08-04).
 */
describe("groupPromotionsForPrint", () => {
  it("INVOICE_DISCOUNT goes into invoiceDiscountTotal", () => {
    const programs: PromotionAmount[] = [
      { type: PromotionProgramType.INVOICE_DISCOUNT, discountAmount: 100_000 },
    ];
    expect(groupPromotionsForPrint(programs)).toEqual({
      invoiceDiscountTotal: 100_000,
      itemDiscountTotal: undefined,
    });
  });

  it("ITEM_DISCOUNT goes into itemDiscountTotal", () => {
    const programs: PromotionAmount[] = [
      { type: PromotionProgramType.ITEM_DISCOUNT, discountAmount: 50_000 },
    ];
    expect(groupPromotionsForPrint(programs)).toEqual({
      invoiceDiscountTotal: undefined,
      itemDiscountTotal: 50_000,
    });
  });

  it("TIERED_DISCOUNT goes into itemDiscountTotal", () => {
    const programs: PromotionAmount[] = [
      { type: PromotionProgramType.TIERED_DISCOUNT, discountAmount: 30_000 },
    ];
    expect(groupPromotionsForPrint(programs)).toEqual({
      invoiceDiscountTotal: undefined,
      itemDiscountTotal: 30_000,
    });
  });

  it("BUY_M_GET_N goes into itemDiscountTotal", () => {
    const programs: PromotionAmount[] = [
      { type: PromotionProgramType.BUY_M_GET_N, discountAmount: 15_000 },
    ];
    expect(groupPromotionsForPrint(programs)).toEqual({
      invoiceDiscountTotal: undefined,
      itemDiscountTotal: 15_000,
    });
  });

  it("GIFT_ITEM is excluded from both buckets even when it carries a nonzero amount", () => {
    // T-08-05 regression: a discountAmount: 0 fixture here would pass even
    // without the exclusion branch (0 summed into either bucket is still
    // undefined) — use a real nonzero value paired with an ITEM_DISCOUNT so
    // the test actually fails if GIFT_ITEM's amount leaks into a bucket.
    const programs: PromotionAmount[] = [
      { type: PromotionProgramType.GIFT_ITEM, discountAmount: 15_000 },
      { type: PromotionProgramType.ITEM_DISCOUNT, discountAmount: 10_000 },
    ];
    expect(groupPromotionsForPrint(programs)).toEqual({
      invoiceDiscountTotal: undefined,
      itemDiscountTotal: 10_000,
    });
  });

  it("sums multiple programs of the same bucket", () => {
    const programs: PromotionAmount[] = [
      { type: PromotionProgramType.ITEM_DISCOUNT, discountAmount: 20_000 },
      { type: PromotionProgramType.TIERED_DISCOUNT, discountAmount: 10_000 },
      { type: PromotionProgramType.INVOICE_DISCOUNT, discountAmount: 100_000 },
    ];
    expect(groupPromotionsForPrint(programs)).toEqual({
      invoiceDiscountTotal: 100_000,
      itemDiscountTotal: 30_000,
    });
  });

  it("returns both buckets undefined (not 0) when the total is zero", () => {
    expect(groupPromotionsForPrint([])).toEqual({
      invoiceDiscountTotal: undefined,
      itemDiscountTotal: undefined,
    });
  });
});
