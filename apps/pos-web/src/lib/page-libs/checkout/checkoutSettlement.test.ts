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
