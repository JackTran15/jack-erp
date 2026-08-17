import { describe, expect, it } from "vitest";

import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";

/**
 * "Tính vào công nợ" must net against tendered cash/transfer (partial debt):
 * debtAmount = max(0, amountDue − totalPaid) for a sale. Refund-debt unchanged.
 */
describe("deriveSettlement — debt (Tính vào công nợ)", () => {
  const base = {
    grandTotal: 1_500_000,
    deposit: 50_000,
    keepChange: false,
  };

  it("nets the booked debt against tendered cash (residual)", () => {
    const r = deriveSettlement({
      ...base,
      paymentLines: [{ amount: 145_000 }],
      debt: true,
    });
    expect(r.settlementGrandTotal).toBe(1_450_000);
    expect(r.totalPaid).toBe(145_000);
    expect(r.debtAmount).toBe(1_305_000);
    expect(r.changeAmount).toBe(0);
    expect(r.shortageAmount).toBe(0);
  });

  it("books the full balance when no cash is tendered", () => {
    const r = deriveSettlement({
      ...base,
      paymentLines: [],
      debt: true,
    });
    expect(r.debtAmount).toBe(1_450_000);
  });

  it("books zero debt when tendered cash covers the balance", () => {
    const r = deriveSettlement({
      ...base,
      paymentLines: [{ amount: 1_450_000 }],
      debt: true,
    });
    expect(r.debtAmount).toBe(0);
  });

  it("keeps refund-debt at the full magnitude (out of scope)", () => {
    const r = deriveSettlement({
      grandTotal: -200_000,
      deposit: 0,
      keepChange: false,
      paymentLines: [],
      debt: true,
    });
    expect(r.settlementGrandTotal).toBe(-200_000);
    expect(r.settlementAbs).toBe(200_000);
    expect(r.debtAmount).toBe(200_000);
  });

  it("does not book debt when the box is unticked (underpayment is a shortage)", () => {
    const r = deriveSettlement({
      ...base,
      paymentLines: [{ amount: 145_000 }],
      debt: false,
    });
    expect(r.debtAmount).toBe(0);
    expect(r.shortageAmount).toBe(1_305_000);
  });
});

/**
 * QA #2 (POS side). When the value of the points a cashier applies exceeds what
 * is left after the promotion, the server clamps `amountDue` to 0 — but this
 * helper subtracted the discounts unconditionally, so the till displayed a
 * negative "Còn phải thu" (−36.000 in the reported case) that no longer matched
 * what the server would charge.
 */
describe("deriveSettlement — discounts never push a sale below zero", () => {
  it("clamps at 0 when point value exceeds the amount left after the promotion", () => {
    const r = deriveSettlement({
      grandTotal: 580_000,
      deposit: 0,
      keepChange: false,
      paymentLines: [],
      debt: false,
      promotionDiscountAmount: 116_000,
      pointsDiscountAmount: 500_000, // 1,000 points — 36,000 more than is left
    });

    expect(r.settlementGrandTotal).toBe(0);
    expect(r.shortageAmount).toBe(0);
  });

  it("still subtracts discounts normally when they fit", () => {
    const r = deriveSettlement({
      grandTotal: 580_000,
      deposit: 0,
      keepChange: false,
      paymentLines: [],
      debt: false,
      promotionDiscountAmount: 116_000,
      pointsDiscountAmount: 50_000,
    });

    expect(r.settlementGrandTotal).toBe(414_000);
  });

  it("leaves a refund negative — a return's grand total is meant to be below zero", () => {
    const r = deriveSettlement({
      grandTotal: -580_000,
      deposit: 0,
      keepChange: false,
      paymentLines: [],
      debt: false,
    });

    expect(r.settlementGrandTotal).toBe(-580_000);
  });
});

/**
 * T-01-03 (AC-06) — the "Đặt cọc" control is hidden, so `deposit` is pinned
 * at its default `0` forever. A zero deposit must be a true no-op on
 * settlement math: `settlementGrandTotal` reduces to
 * `grandTotal + (returnFee ?? 0)`, exactly matching pre-hide behaviour.
 */
describe("deriveSettlement — deposit: 0 is a no-op on settlement math (regression)", () => {
  it("settlementGrandTotal equals grandTotal + returnFee for a plain sale", () => {
    const r = deriveSettlement({
      grandTotal: 1_500_000,
      deposit: 0,
      returnFee: 20_000,
      keepChange: false,
      paymentLines: [],
      debt: false,
    });
    expect(r.settlementGrandTotal).toBe(1_500_000 + 20_000);
  });

  it("settlementGrandTotal equals grandTotal when there is no returnFee either", () => {
    const r = deriveSettlement({
      grandTotal: 1_500_000,
      deposit: 0,
      keepChange: false,
      paymentLines: [],
      debt: false,
    });
    expect(r.settlementGrandTotal).toBe(1_500_000);
  });
});
