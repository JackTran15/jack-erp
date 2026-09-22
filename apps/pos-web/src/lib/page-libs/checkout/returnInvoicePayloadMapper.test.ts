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
 * A net refund (`netAmount` < 0, số BE trả ở `checkout-return/preview`) routes
 * to the fund the operator picked in "Hình thức đổi trả": a cash line → CASH, a bank/card account → BANK
 * + its payment_accounts id. Luồng hoàn tiền không bao giờ gửi OFFSET nữa: BE tự
 * trừ công nợ hóa đơn gốc trước rồi mới chi phần còn lại qua quỹ này.
 */
describe("buildCheckoutReturnPayload — net refund routing", () => {
  it("routes a cash fund selection to CASH", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: -200_000,
      paymentLines: [line(PaymentMethodEnum.CASH, 200_000, "cash-acc")],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("CASH");
    expect(res.body.refundAccountId).toBeUndefined();
  });

  it("routes a bank/card account selection to BANK + refundAccountId", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: -200_000,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, "bank-acc-1")],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("BANK");
    expect(res.body.refundAccountId).toBe("bank-acc-1");
  });

  it("never sends OFFSET on a refund — the debt offset is BE-side now (AC-15)", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: -200_000,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, "bank-acc-1")],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("BANK");
    expect(res.body.refundAccountId).toBe("bank-acc-1");
  });

  it("errors when a bank refund line has no account selected", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: -200_000,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 200_000, null)],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("missing_payment_account");
  });

  it("defaults to CASH when no fund line is present (e.g. quick return with empty picker)", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: -200_000,
      paymentLines: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("CASH");
  });
});

/**
 * 2026092102 / T-04-02 (AC-24) — the money direction is `netAmount` from the BE
 * dry-run, and the cashier's selected/excluded programme ids ride along on every
 * branch, only when non-empty.
 */
describe("buildCheckoutReturnPayload — netAmount từ BE + selected/excluded ids", () => {
  it("net > 0 → CASH + payments, ids attached", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: 112_500,
      paymentLines: [line(PaymentMethodEnum.CASH, 112_500, "cash-acc")],
      excludedProgramIds: ["P1"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("CASH");
    expect(res.body.payments).toEqual([
      { paymentMethod: "cash", amount: 112_500, paymentAccountId: "cash-acc" },
    ]);
    expect(res.body.excludedProgramIds).toEqual(["P1"]);
    expect(res.body).not.toHaveProperty("selectedProgramIds");
  });

  it("net = 0 → OFFSET, no payments, ids attached", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: 0,
      paymentLines: [line(PaymentMethodEnum.CASH, 0, "cash-acc")],
      selectedProgramIds: ["P2"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.refundMethod).toBe("OFFSET");
    expect(res.body).not.toHaveProperty("payments");
    expect(res.body.selectedProgramIds).toEqual(["P2"]);
  });

  it("net < 0 → refund, ids attached on both CASH and BANK", () => {
    const cash = buildCheckoutReturnPayload({
      netAmount: -50_000,
      paymentLines: [line(PaymentMethodEnum.CASH, 50_000, "cash-acc")],
      selectedProgramIds: ["P2"],
      excludedProgramIds: ["P1"],
    });
    expect(cash.ok && cash.body.refundMethod).toBe("CASH");
    expect(cash.ok && cash.body.selectedProgramIds).toEqual(["P2"]);
    expect(cash.ok && cash.body.excludedProgramIds).toEqual(["P1"]);

    const bank = buildCheckoutReturnPayload({
      netAmount: -50_000,
      paymentLines: [line(PaymentMethodEnum.TRANSFER, 50_000, "bank-acc-1")],
      excludedProgramIds: ["P1"],
    });
    expect(bank.ok && bank.body.refundMethod).toBe("BANK");
    expect(bank.ok && bank.body.excludedProgramIds).toEqual(["P1"]);
  });

  it("empty id arrays are dropped from the wire body", () => {
    const res = buildCheckoutReturnPayload({
      netAmount: 0,
      paymentLines: [],
      selectedProgramIds: [],
      excludedProgramIds: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(JSON.parse(JSON.stringify(res.body))).not.toHaveProperty("selectedProgramIds");
    expect(JSON.parse(JSON.stringify(res.body))).not.toHaveProperty("excludedProgramIds");
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

/**
 * KM theo dòng phải đi lên BE dưới dạng ý định (type/value/reason). Gửi cứng
 * `lineDiscount: 0` như bản cũ khiến chứng từ nhận giá gộp: một đơn đổi POS hiện
 * "Còn phải thu 19.500" bị BE tính thành 225.000 rồi đòi ghi công nợ.
 */
describe("buildCreateExchangePayload — KM theo dòng", () => {
  const returnLine = cartLine({
    lineId: "ret-1",
    unitPrice: 460_000,
    isReturnCredit: true,
  });
  const discountedNewLine = cartLine({
    lineId: "new-1",
    unitPrice: 685_000,
    lineDiscount: { type: "percent", value: 30, reason: "sale30" },
  });

  it("gửi bộ ba KM của dòng mua thêm, không gửi số tiền đã tính", () => {
    const body = buildCreateExchangePayload({
      sessionId: "sess-1",
      customer: null,
      reason: "Đổi trả nhanh",
      returnLines: [returnLine],
      newLines: [discountedNewLine],
    });

    expect(body.newLines[0]).toMatchObject({
      lineDiscountType: "percent",
      lineDiscountValue: 30,
      lineDiscountReason: "sale30",
    });
    expect(body.newLines[0].lineDiscount).toBeUndefined();
  });

  it("gửi bộ ba KM của dòng trả", () => {
    const body = buildCreateExchangePayload({
      sessionId: "sess-1",
      customer: null,
      reason: "Đổi trả nhanh",
      returnLines: [
        cartLine({
          lineId: "ret-2",
          unitPrice: 500_000,
          isReturnCredit: true,
          lineDiscount: { type: "percent", value: 10, reason: "sale10" },
        }),
      ],
      newLines: [discountedNewLine],
    });

    expect(body.returnLines[0]).toMatchObject({
      lineDiscountType: "percent",
      lineDiscountValue: 10,
      lineDiscountReason: "sale10",
    });
    expect(body.returnLines[0].lineDiscount).toBeUndefined();
  });

  it("dòng không có KM thì không kèm field KM nào", () => {
    const body = buildCreateExchangePayload({
      sessionId: "sess-1",
      customer: null,
      reason: "Đổi trả nhanh",
      returnLines: [returnLine],
      newLines: [cartLine({ lineId: "new-2" })],
    });

    expect(body.newLines[0].lineDiscountType).toBeUndefined();
    expect(body.returnLines[0].lineDiscountType).toBeUndefined();
  });
});
