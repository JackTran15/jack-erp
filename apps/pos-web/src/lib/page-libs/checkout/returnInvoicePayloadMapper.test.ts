import { describe, expect, it } from "vitest";

import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import {
  buildCheckoutReturnPayload,
  buildCreateExchangePayload,
} from "@erp/pos/lib/page-libs/checkout/returnInvoicePayloadMapper";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";

function line(
  method: PaymentMethodEnum,
  amount: number,
  paymentAccountId: string | null,
  id = "line-1",
): PaymentLine {
  return { id, method, paymentAccountId, amount };
}

function cartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "cart-1",
    itemId: "item-1",
    name: "Áo thun",
    code: "SKU-1",
    unit: "Cái",
    unitPrice: 100_000,
    qty: 1,
    locationId: "loc-1",
    ...overrides,
  } as CartLine;
}

/**
 * A net refund (returnSubtotal > newSubtotal) routes to the fund the operator
 * picked in "Hình thức đổi trả": a cash line → CASH, a bank/card account → BANK
 * + its payment_accounts id. Luồng hoàn tiền không bao giờ gửi OFFSET nữa: BE tự
 * trừ công nợ hóa đơn gốc trước rồi mới chi phần còn lại qua quỹ này.
 */
describe("buildCheckoutReturnPayload — net refund routing", () => {
  it("routes a cash fund selection to CASH", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.CASH, 200_000, "cash-acc")],
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
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("BANK");
    expect(res.body.refundAccountId).toBe("bank-acc-1");
  });

  it("never sends OFFSET on a refund — the debt offset is BE-side now (AC-15)", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, "bank-acc-1")],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("BANK");
    expect(res.body.refundAccountId).toBe("bank-acc-1");
  });

  it("errors when a bank refund line has no account selected", () => {
    const res = buildCheckoutReturnPayload({
      returnSubtotal: 200_000,
      newSubtotal: 0,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, null)],
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
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("CASH");
  });
});

/**
 * `originalInvoiceId` is what tells the backend which mode to run: present →
 * regular exchange (eligibility checked against the original sale), absent →
 * quick exchange (free-form lines). It must be absent from the JSON entirely,
 * not present as `null` — the backend DTO declares `@IsUUID` and the global
 * ValidationPipe would reject a null.
 */
describe("buildCreateExchangePayload — originalInvoiceId is the mode discriminator", () => {
  const base = {
    sessionId: "session-1",
    customer: null,
    reason: "Đổi hàng",
    returnLines: [cartLine({ lineId: "ret-1", originalInvoiceItemId: "orig-1" })],
    newLines: [cartLine({ lineId: "new-1" })],
  };

  it("carries originalInvoiceId through for an invoice-backed exchange", () => {
    const body = buildCreateExchangePayload({
      ...base,
      originalInvoiceId: "orig-invoice-1",
    });
    expect(body.originalInvoiceId).toBe("orig-invoice-1");
  });

  it("omits the key entirely for a quick exchange", () => {
    const body = buildCreateExchangePayload({
      ...base,
      returnLines: [cartLine({ lineId: "ret-1" })],
    });
    expect(body.originalInvoiceId).toBeUndefined();
    // The wire format is what matters: `undefined` disappears, `null` would not.
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty(
      "originalInvoiceId",
    );
  });

  it("maps return lines to IN-shaped bodies and new lines to SALE-shaped bodies", () => {
    const body = buildCreateExchangePayload({
      ...base,
      returnLines: [cartLine({ lineId: "ret-1", qty: 2, unitPrice: 50_000 })],
    });
    expect(body.returnLines).toHaveLength(1);
    expect(body.returnLines[0]).toMatchObject({
      itemId: "item-1",
      quantity: 2,
      unitPrice: 50_000,
      locationId: "loc-1",
    });
    expect(body.newLines[0]).toMatchObject({ itemId: "item-1", sortOrder: 0 });
  });
});
