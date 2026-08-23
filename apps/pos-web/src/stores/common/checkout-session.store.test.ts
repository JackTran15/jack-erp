import { beforeEach, describe, expect, it } from "vitest";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import { usePosCheckoutSessionStore } from "./checkout-session.store";

/**
 * Hiện trường MT46: BX140 có 8 ở kệ kho lưu trữ và 4 ở kệ mặc định của showroom.
 * POS chỉ trừ kho ở showroom, nên 4 mới là trần cảnh báo — 12 là con số làm
 * cảnh báo bật muộn đúng bằng lượng hàng nằm trong kho.
 */
const bx140 = (over: Partial<PosCatalogLine> = {}): PosCatalogLine => ({
  itemId: "BX140",
  productId: null,
  code: "BX140",
  name: "BX140",
  unit: "CHAI",
  sellingPrice: 140_000,
  quantityOnHand: 12,
  sellableQuantity: 4,
  locations: [
    { locationId: "L-WH", name: "999", quantity: 8 },
    { locationId: "L-SR", name: "Mặc định", quantity: 4 },
  ],
  defaultLocationId: "L-WH",
  ...over,
});

const cartLine = (over: Partial<CartLine> = {}): CartLine => ({
  lineId: "line-1",
  itemId: "BX140",
  name: "BX140",
  code: "BX140",
  unit: "CHAI",
  unitPrice: 140_000,
  qty: 5,
  locationId: "L-SR",
  maxQty: 12,
  ...over,
});

function seedCart(line: CartLine): void {
  const state = usePosCheckoutSessionStore.getState();
  usePosCheckoutSessionStore.setState({
    sessions: state.sessions.map((s, i) =>
      i === 0 ? { ...s, purchaseCart: [line] } : s,
    ),
  });
}

function currentLine(): CartLine {
  return usePosCheckoutSessionStore.getState().sessions[0].purchaseCart[0];
}

describe("syncPurchaseCartOnHand", () => {
  beforeEach(() => {
    usePosCheckoutSessionStore.getState().resetSession();
  });

  it("takes maxQty from showroom stock, not the branch-wide total", () => {
    seedCart(cartLine({ maxQty: 12 }));

    usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand([bx140()]);

    expect(currentLine().maxQty).toBe(4);
    expect(currentLine().onHandUnknown).toBe(false);
  });

  it("stays on the showroom basis across repeated syncs", () => {
    // Catalog refetches after every checkout and whenever staleTime lapses. A
    // second pass drifting back to 12 would silently restore the late warning.
    seedCart(cartLine({ maxQty: 12 }));
    const sync = usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand;

    sync([bx140()]);
    sync([bx140()]);

    expect(currentLine().maxQty).toBe(4);
  });

  it("marks the line unknown when the payload carries no sellableQuantity", () => {
    // Simulates an older API that predates the field (ADR-04). Falling back to
    // quantityOnHand here would rebuild the exact number this feature drops,
    // and `qty > undefined` is false — the warning would switch off in silence.
    seedCart(cartLine({ maxQty: 4 }));
    const legacy = bx140();
    delete (legacy as Partial<PosCatalogLine>).sellableQuantity;

    usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand([legacy]);

    expect(currentLine().onHandUnknown).toBe(true);
    expect(currentLine().maxQty).not.toBe(12);
  });
});
