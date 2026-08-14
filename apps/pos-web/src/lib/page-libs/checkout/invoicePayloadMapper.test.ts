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
      amountDue: 200_000,
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
      amountDue: 145_000,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments).toEqual([]);
  });

  it("fails when a tendered line has no payment account", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(145_000, null)],
      amountDue: 145_000,
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
      amountDue: 145_000,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments.map((p) => p.amount)).toEqual([100_000, 45_000]);
    expect(res.body.payments.map((p) => p.paymentMethod)).toEqual([
      "cash",
      "bank_transfer",
    ]);
  });

  // Over-tender: thu ngân gõ (hoặc bấm chip "Gợi ý tiền mặt") số lớn hơn số cần
  // thu. BE chặn ∑payments > amountDue, nên phần vượt phải bị kẹp lại ở FE.
  it("caps the posted amount at amountDue when the customer over-tenders", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(400_000, "acc-1")],
      amountDue: 340_000,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments).toEqual([
      { paymentMethod: "cash", amount: 340_000, paymentAccountId: "acc-1" },
    ]);
    expect(res.body.keptChangeAmount).toBeUndefined();
  });

  it("caps a split tender line by line and drops fully-covered lines", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [
        cashLine(300_000, "acc-1", "l1"),
        {
          id: "l2",
          method: PaymentMethodEnum.TRANSFER,
          paymentAccountId: "acc-2",
          amount: 200_000,
        },
        cashLine(100_000, "acc-3", "l3"),
      ],
      amountDue: 340_000,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments.map((p) => p.amount)).toEqual([300_000, 40_000]);
  });

  it("reports the surplus as keptChangeAmount when the customer leaves it", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(400_000, "acc-1")],
      amountDue: 340_000,
      keepChange: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments).toEqual([
      { paymentMethod: "cash", amount: 340_000, paymentAccountId: "acc-1" },
    ]);
    expect(res.body.keptChangeAmount).toBe(60_000);
  });

  // "Bớt tiền lẻ cho khách" dùng chung cờ keepChange nhưng ở chiều thu THIẾU —
  // không có tiền thừa nào để ghi nhận.
  it("omits keptChangeAmount when keepChange is on but nothing was over-tendered", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(339_000, "acc-1")],
      amountDue: 340_000,
      keepChange: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.payments.map((p) => p.amount)).toEqual([339_000]);
    expect(res.body.keptChangeAmount).toBeUndefined();
  });
});
