import { describe, expect, it } from "vitest";

import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { buildCheckoutInvoiceApiPayload } from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";

function cashLine(
  amount: number,
  paymentAccountId: string | null,
  id = "line-1",
): PaymentLine {
  return { id, method: PaymentMethodEnum.CASH, paymentAccountId, amount };
}

/**
 * With "Tính vào công nợ" on, the tendered cash must still be posted — the backend
 * books only the residual as receivable. An empty/zero set yields full debt.
 */
describe("buildCheckoutInvoiceApiPayload", () => {
  it("posts the tendered cash line (partial debt)", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(145_000, "acc-1")],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0]).toMatchObject({
      paymentMethod: "cash",
      amount: 145_000,
      paymentAccountId: "acc-1",
    });
  });

  it("sends an empty payments array when nothing is tendered (full debt)", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(0, "acc-1")],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments).toEqual([]);
  });

  it("fails when a tendered line has no payment account", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(145_000, null)],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("missing_payment_account");
  });

  it("maps a split tender, preserving order", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [
        cashLine(100_000, "acc-1", "l1"),
        {
          id: "l2",
          method: PaymentMethodEnum.TRANSFER,
          paymentAccountId: "acc-2",
          amount: 45_000,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments.map((p) => p.amount)).toEqual([100_000, 45_000]);
    expect(res.body.payments.map((p) => p.paymentMethod)).toEqual([
      "cash",
      "bank_transfer",
    ]);
  });
});
