import { describe, expect, it } from "vitest";

import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import type {
  CartLine,
  PaymentMethodOption,
} from "@erp/pos/interfaces/checkout.interface";

const cart: CartLine[] = [
  {
    lineId: "line-1",
    itemId: "item-1",
    name: "Sản phẩm A",
    code: "SP001",
    unit: "Cái",
    unitPrice: 100_000,
    qty: 1,
    locationId: "loc-1",
    maxQty: 10,
  },
];

const methods: PaymentMethodOption[] = [];

function buildPayload(deposit: number, settlementTotal: number) {
  return buildCheckoutInvoicePayload({
    printInvoice: true,
    cart,
    grandTotal: 100_000,
    settlementTotal,
    deposit,
    totalPaid: settlementTotal,
    paymentLines: [],
    primaryMethodLabel: "Tiền mặt",
    methods,
    keepChange: false,
    debt: false,
  });
}

/**
 * T-01-03 (AC-07) — with the "Đặt cọc" control hidden, `deposit` is pinned
 * at its default `0` forever. `checkoutReceiptFactory.ts` already guards
 * with `deposit > 0 ? deposit : undefined`, so `0` and `undefined` were
 * already equivalent inputs before this feature existed. This locks that in:
 * the printed-receipt payload never regresses for the no-deposit case.
 */
describe("buildCheckoutInvoicePayload — depositAmount", () => {
  it("omits depositAmount when deposit is 0 (no-deposit sale)", () => {
    const payload = buildPayload(0, 100_000);
    expect(payload?.totals.depositAmount).toBeUndefined();
  });

  it("keeps depositAmount for a non-zero deposit", () => {
    const payload = buildPayload(50_000, 50_000);
    expect(payload?.totals.depositAmount).toBe(50_000);
  });
});
