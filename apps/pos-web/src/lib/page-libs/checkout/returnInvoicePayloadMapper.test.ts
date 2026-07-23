import { describe, expect, it } from "vitest";

import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { buildCheckoutReturnPayload } from "@erp/pos/lib/page-libs/checkout/returnInvoicePayloadMapper";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";

function line(
  method: PaymentMethodEnum,
  amount: number,
  paymentAccountId: string | null,
  id = "line-1",
): PaymentLine {
  return { id, method, paymentAccountId, amount };
}

/**
 * A net refund (returnSubtotal > newSubtotal) routes to the fund the operator
 * picked in "Hình thức đổi trả": a cash line → CASH, a bank/card account → BANK
 * + its payment_accounts id, and "Tính vào công nợ" → OFFSET regardless.
 */
describe("buildCheckoutReturnPayload — net refund routing", () => {
  it("routes a cash fund selection to CASH", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.CASH, 200_000, "cash-acc")],
      offsetToDebt: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("CASH");
    expect(res.body.refundAccountId).toBeUndefined();
  });

  it("routes a bank/card account selection to BANK + refundAccountId", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, "bank-acc-1")],
      offsetToDebt: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("BANK");
    expect(res.body.refundAccountId).toBe("bank-acc-1");
  });

  it("routes to OFFSET when the operator ticked Tính vào công nợ, ignoring the fund", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, "bank-acc-1")],
      offsetToDebt: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("OFFSET");
    expect(res.body.refundAccountId).toBeUndefined();
  });

  it("errors when a bank refund line has no account selected", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, null)],
      offsetToDebt: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("missing_payment_account");
  });

  it("defaults to CASH when no fund line is present (e.g. quick return with empty picker)", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [],
      offsetToDebt: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("CASH");
  });
});
