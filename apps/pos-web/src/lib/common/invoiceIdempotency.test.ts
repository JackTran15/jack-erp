import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoiceCreateIdempotencyKey } from "./invoiceIdempotency";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";

const cartBody = (qty: number) => ({
  sessionId: "pos-1",
  customerId: "cus-1",
  items: [{ itemId: "BX140", quantity: qty, unitPrice: 140_000 }],
});

describe("invoiceCreateIdempotencyKey", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    usePosCheckoutSessionStore.getState().resetSession();
  });

  it("gives one key to repeated submits of the same cart", () => {
    // Lỗi trên prod: mỗi lần bấm lại là một key mới, nên một lần bán ra ba
    // draft + ba dòng checkout_saga.
    expect(invoiceCreateIdempotencyKey(cartBody(2))).toBe(
      invoiceCreateIdempotencyKey(cartBody(2)),
    );
  });

  it("gives a new key once the cart has been edited", () => {
    // Sửa giỏ rồi bấm lại mà giữ nguyên key thì BE trả 409 IDEMPOTENCY_CONFLICT
    // (record sống 24h) — thu ngân kẹt cứng, tệ hơn cả lỗi đang sửa.
    expect(invoiceCreateIdempotencyKey(cartBody(2))).not.toBe(
      invoiceCreateIdempotencyKey(cartBody(3)),
    );
  });

  it("gives a new key to the next document on the same tab", () => {
    const first = invoiceCreateIdempotencyKey(cartBody(2));

    usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();

    expect(invoiceCreateIdempotencyKey(cartBody(2))).not.toBe(first);
  });
});
