import { describe, expect, it } from "vitest";

import { payloadLineSubtotal } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";

function cartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "cart-1",
    itemId: "item-1",
    name: "Giày thể thao",
    code: "AK29011-XA-36",
    unit: "Đôi",
    unitPrice: 685_000,
    qty: 1,
    locationId: "loc-1",
    ...overrides,
  } as CartLine;
}

/**
 * `net = newSubtotal − returnSubtotal` quyết định chiều tiền của đơn đổi/trả,
 * nên hai số này phải trùng với cái BE tính lại từ payload — kể cả KM dòng.
 */
describe("payloadLineSubtotal", () => {
  it("trừ KM phần trăm khỏi tiền dòng", () => {
    expect(
      payloadLineSubtotal(
        cartLine({ lineDiscount: { type: "percent", value: 30, reason: "sale30" } }),
      ),
    ).toBe(479_500);
  });

  it("trừ KM số tiền", () => {
    expect(
      payloadLineSubtotal(
        cartLine({
          unitPrice: 300_000,
          lineDiscount: { type: "amount", value: 30_000, reason: "hàng lỗi" },
        }),
      ),
    ).toBe(270_000);
  });

  it("dòng không KM giữ nguyên gross", () => {
    expect(payloadLineSubtotal(cartLine({ unitPrice: 460_000 }))).toBe(460_000);
  });

  it("không đảo dấu và không dùng refundableUnitPrice cho dòng trả", () => {
    // Payload gửi `unitPrice` niêm yết, nên bản sao phía FE cũng phải tính trên
    // giá niêm yết — dùng refundableUnitPrice ở đây sẽ lệch với BE.
    expect(
      payloadLineSubtotal(
        cartLine({
          unitPrice: 460_000,
          isReturnCredit: true,
          refundableUnitPrice: 400_000,
        }),
      ),
    ).toBe(460_000);
  });

  it("ca thật: 685.000 −30% mua thêm, 460.000 trả lại → net 19.500", () => {
    const newSubtotal = payloadLineSubtotal(
      cartLine({ lineDiscount: { type: "percent", value: 30, reason: "sale30" } }),
    );
    const returnSubtotal = payloadLineSubtotal(
      cartLine({ unitPrice: 460_000, isReturnCredit: true }),
    );
    expect(newSubtotal - returnSubtotal).toBe(19_500);
  });
});
