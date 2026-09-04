import { describe, expect, it } from "vitest";

import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import {
  buildCheckoutInvoiceApiPayload,
  mapInvoiceRowToDraftInvoice,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
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

  // T-02-04 — CTKM tùy chọn đã chọn phải đi tới server lúc checkout (AC-10).
  it("forwards selectedProgramIds when set", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(145_000, "acc-1")],
      amountDue: 145_000,
      selectedProgramIds: ["P1"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.selectedProgramIds).toEqual(["P1"]);
  });

  it("omits selectedProgramIds entirely when nothing is selected — body stays identical to before the field existed", () => {
    const res = buildCheckoutInvoiceApiPayload({
      paymentLines: [cashLine(145_000, "acc-1")],
      amountDue: 145_000,
      selectedProgramIds: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.selectedProgramIds).toBeUndefined();
  });
});

/**
 * Khôi phục phiếu nháp đổi/trả: `direction` quyết định dòng về giỏ nào, `type`
 * quyết định tab mở ra là đơn bán hay đơn đổi trả. Bản cũ bỏ cả hai, nên một
 * phiếu EXCHANGE dở dang mở lại thành đơn bán với hàng khách trả nằm trong giỏ
 * mua — thu ngân xoá dòng đó rồi thanh toán là thành hoá đơn EXCHANGE có
 * `net_amount` mồ côi.
 */
describe("mapInvoiceRowToDraftInvoice — phiếu đổi/trả", () => {
  const inLine = {
    id: "item-in",
    itemId: "i-1",
    itemCode: "TH9864-K-37",
    itemName: "Giày nữ",
    unit: "Đôi",
    quantity: 1,
    unitPrice: 460_000,
    lineDiscount: 0,
    lineTotal: 460_000,
    direction: "IN" as const,
    locationId: "loc-1",
    sortOrder: 0,
  };
  const outLine = {
    id: "item-out",
    itemId: "i-2",
    itemCode: "AK29011-XA-36",
    itemName: "Giày thể thao",
    unit: "Đôi",
    quantity: 1,
    unitPrice: 685_000,
    lineDiscount: 205_500,
    lineDiscountType: "percent" as const,
    lineDiscountValue: 30,
    lineDiscountReason: "sale30",
    lineTotal: 479_500,
    direction: "OUT" as const,
    locationId: "loc-1",
    sortOrder: 1,
  };
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: "inv-1",
      code: "DRAFT-abc",
      status: "draft",
      isDraft: true,
      sessionId: "sess-1",
      staffId: "user-1",
      subtotal: 479_500,
      amountDue: 19_500,
      createdAt: new Date().toISOString(),
      items: [inLine, outLine],
      ...over,
    }) as never;

  it("EXCHANGE: tách dòng IN sang giỏ trả, dòng OUT sang giỏ mua", () => {
    const draft = mapInvoiceRowToDraftInvoice(row({ type: "EXCHANGE" }));

    expect(draft.checkoutVariant).toBe("quick_exchange");
    expect(draft.quickExchangeReturn?.map((l) => l.code)).toEqual([
      "TH9864-K-37",
    ]);
    expect(draft.quickExchangePurchase?.map((l) => l.code)).toEqual([
      "AK29011-XA-36",
    ]);
    expect(draft.quickExchangeReturn?.[0].isReturnCredit).toBe(true);
    expect(draft.quickExchangePurchase?.[0].isReturnCredit).toBeUndefined();
  });

  it("EXCHANGE: KM theo dòng được dựng lại", () => {
    const draft = mapInvoiceRowToDraftInvoice(row({ type: "EXCHANGE" }));

    expect(draft.quickExchangePurchase?.[0].lineDiscount).toEqual({
      type: "percent",
      value: 30,
      reason: "sale30",
    });
  });

  it("EXCHANGE theo hóa đơn gốc: giữ originalInvoiceId và originalInvoiceItemId", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      row({
        type: "EXCHANGE",
        originalInvoiceId: "orig-1",
        items: [{ ...inLine, originalInvoiceItemId: "orig-item-1" }, outLine],
      }),
    );

    expect(draft.originalInvoiceId).toBe("orig-1");
    expect(draft.quickExchangeReturn?.[0].originalInvoiceItemId).toBe(
      "orig-item-1",
    );
  });

  it("RETURN: toàn bộ dòng nằm ở giỏ trả, giỏ mua rỗng", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      row({ type: "RETURN", items: [inLine] }),
    );

    expect(draft.checkoutVariant).toBe("quick_exchange");
    expect(draft.quickExchangeReturn).toHaveLength(1);
    expect(draft.quickExchangePurchase).toEqual([]);
  });

  it("SALE: giữ nguyên hành vi cũ — không tách giỏ, không đặt variant", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      row({ type: "SALE", items: [outLine] }),
    );

    expect(draft.checkoutVariant).toBeUndefined();
    expect(draft.quickExchangeReturn).toBeUndefined();
    expect(draft.lines).toHaveLength(1);
  });
});
