import { beforeEach, describe, expect, it } from "vitest";

import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import { mapInvoiceRowToDraftInvoice } from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import {
  computeOversellLines,
  selectActiveSession,
  selectUnknownOnHandLineCount,
  usePosCheckoutSessionStore,
} from "./checkout-session.store";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";

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

describe("selectUnknownOnHandLineCount", () => {
  beforeEach(() => {
    usePosCheckoutSessionStore.getState().resetSession();
  });

  const count = () =>
    selectUnknownOnHandLineCount(usePosCheckoutSessionStore.getState());

  it("đếm dòng chưa-biết-tồn để làm tín hiệu chạy lại đồng bộ", () => {
    // Dòng khôi phục từ hóa đơn lưu tạm vào giỏ với cờ này. Catalog KHÔNG đổi
    // reference lúc đó, nên con số này là thứ duy nhất báo cho effect biết còn
    // dòng đang chờ điền tồn.
    seedCart(cartLine({ maxQty: 0, onHandUnknown: true }));

    expect(count()).toBe(1);
  });

  it("về 0 sau khi sync điền được tồn thật — vòng lặp hội tụ", () => {
    seedCart(cartLine({ maxQty: 0, onHandUnknown: true }));

    usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand([bx140()]);

    expect(count()).toBe(0);
    expect(currentLine().maxQty).toBe(4);
  });

  it("đứng yên khi hàng không có trong catalog — không lặp vô hạn", () => {
    // Hàng chưa có bản ghi tồn tại chi nhánh: sync không điền được gì, cờ giữ
    // nguyên. Con số phải ĐỨNG YÊN, nếu không effect tự kích hoạt lại chính nó.
    seedCart(cartLine({ maxQty: 0, onHandUnknown: true }));
    const sync = usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand;

    sync([bx140({ itemId: "KHAC", code: "KHAC" })]);
    const after = count();
    sync([bx140({ itemId: "KHAC", code: "KHAC" })]);

    expect(after).toBe(1);
    expect(count()).toBe(1);
    expect(currentLine().onHandUnknown).toBe(true);
  });

  it("không đếm dòng hàng trả — dòng đó không cảnh báo vượt tồn", () => {
    seedCart(cartLine({ isReturnCredit: true, maxQty: 0, onHandUnknown: true }));

    expect(count()).toBe(0);
  });
});

describe("cảnh báo vượt tồn sau khi khôi phục nháp", () => {
  beforeEach(() => {
    usePosCheckoutSessionStore.getState().resetSession();
  });

  it("giữ cảnh báo khi SL thật sự vượt tồn showroom", () => {
    // Giỏ ghi 5, showroom còn 4. Sync điền số thật rồi, nhưng dòng vẫn phải nằm
    // trong danh sách bật dialog "Cảnh báo xuất quá số lượng tồn".
    seedCart(cartLine({ qty: 5, maxQty: 0, onHandUnknown: true }));

    usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand([bx140()]);

    expect(currentLine().maxQty).toBe(4);
    expect(currentLine().onHandUnknown).toBe(false);
    expect(
      computeOversellLines(usePosCheckoutSessionStore.getState()),
    ).toHaveLength(1);
  });

  it("hết cảnh báo khi tồn showroom đủ", () => {
    seedCart(cartLine({ qty: 3, maxQty: 0, onHandUnknown: true }));

    usePosCheckoutSessionStore.getState().syncPurchaseCartOnHand([bx140()]);

    expect(
      computeOversellLines(usePosCheckoutSessionStore.getState()),
    ).toHaveLength(0);
  });

  it("hàng không có bản ghi tồn ở chi nhánh vẫn bật cảnh báo", () => {
    seedCart(cartLine({ qty: 1, maxQty: 0, onHandUnknown: true }));

    usePosCheckoutSessionStore
      .getState()
      .syncPurchaseCartOnHand([bx140({ itemId: "KHAC", code: "KHAC" })]);

    expect(
      computeOversellLines(usePosCheckoutSessionStore.getState()),
    ).toHaveLength(1);
  });
});

describe("ensureCheckoutAttemptKey", () => {
  beforeEach(() => {
    usePosCheckoutSessionStore.getState().resetSession();
  });

  it("returns the same nonce for every retry of one document", () => {
    // Bấm "Thanh toán" lần 2, lần 3 phải mang đúng nonce của lần 1 — đó là thứ
    // duy nhất cho BE nhận ra ba request này là một lần lập chứng từ.
    const first = usePosCheckoutSessionStore
      .getState()
      .ensureCheckoutAttemptKey();
    const second = usePosCheckoutSessionStore
      .getState()
      .ensureCheckoutAttemptKey();

    expect(second).toBe(first);
  });

  it("rotates the nonce once the document is done", () => {
    // Hai đơn giỏ hàng giống hệt nhau bán liên tiếp trên cùng tab: giữ nguyên
    // nonce là đơn thứ hai bị replay về hóa đơn của đơn thứ nhất.
    const first = usePosCheckoutSessionStore
      .getState()
      .ensureCheckoutAttemptKey();

    usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();

    expect(
      usePosCheckoutSessionStore.getState().ensureCheckoutAttemptKey(),
    ).not.toBe(first);
  });

  it("keeps each invoice tab on its own nonce", () => {
    const tabOne = usePosCheckoutSessionStore
      .getState()
      .ensureCheckoutAttemptKey();

    usePosCheckoutSessionStore.getState().addSession();

    expect(
      usePosCheckoutSessionStore.getState().ensureCheckoutAttemptKey(),
    ).not.toBe(tabOne);
  });
});

/**
 * Chuỗi khôi phục đầy đủ: hàng `invoices` từ API → `DraftInvoice` → tab đang mở.
 *
 * Test mapper riêng lẻ không bắt được lỗi thật đã xảy ra: mapper đúng nhưng store
 * bỏ qua `checkoutVariant` thì phiếu đổi vẫn mở lại thành đơn bán. Hai nửa phải
 * được kiểm cùng nhau.
 */
const item = (over: Record<string, unknown> = {}) => ({
  id: "item-1",
  itemId: "i-1",
  itemCode: "SKU-1",
  itemName: "Giày",
  unit: "Đôi",
  quantity: 1,
  unitPrice: 460_000,
  lineDiscount: 0,
  lineTotal: 460_000,
  locationId: "loc-1",
  sortOrder: 0,
  ...over,
});

const invoiceRow = (over: Record<string, unknown> = {}) =>
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
    ...over,
  }) as never;

/**
 * Khiếu nại gốc: mở lại phiếu lưu tạm thì ô tiền về 0, phải gõ lại cho từng phiếu
 * treo. Snapshot `draft_payments` sửa chỗ đó; nhánh dự phòng giữ đúng hành vi cũ
 * cho phiếu nháp lưu trước khi có cột.
 */
describe("openDraftInNewSession — khôi phục dòng thanh toán", () => {
  beforeEach(() => {
    usePosCheckoutSessionStore.getState().resetSession();
  });

  const restore = (row: Record<string, unknown>) => {
    usePosCheckoutSessionStore
      .getState()
      .openDraftInNewSession(mapInvoiceRowToDraftInvoice(invoiceRow(row)));
    return selectActiveSession(usePosCheckoutSessionStore.getState())!.draft
      .payment.paymentLines;
  };

  it("trả đúng số tiền và tài khoản của một dòng đã lưu", () => {
    const lines = restore({
      items: [item()],
      draftPayments: [
        { method: "cash", amount: 600_000, paymentAccountId: "acc-1" },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(600_000);
    expect(lines[0].paymentAccountId).toBe("acc-1");
  });

  it("giữ đủ hai dòng chia tiền, đúng thứ tự và phương thức", () => {
    const lines = restore({
      items: [item()],
      draftPayments: [
        { method: "cash", amount: 300_000, paymentAccountId: "acc-1" },
        { method: "bank_transfer", amount: 295_000, paymentAccountId: "acc-2" },
      ],
    });

    expect(lines.map((l) => [l.method, l.amount, l.paymentAccountId])).toEqual([
      [PaymentMethodEnum.CASH, 300_000, "acc-1"],
      [PaymentMethodEnum.TRANSFER, 295_000, "acc-2"],
    ]);
  });

  it("phiếu nháp cũ (không snapshot) ra một dòng tiền mặt = tổng phải thu", () => {
    // KHÔNG phải 0 — 0 chính là lỗi đang sửa. `amountDue` của invoiceRow là 19.500.
    const lines = restore({ items: [item()] });

    expect(lines).toHaveLength(1);
    expect(lines[0].method).toBe(PaymentMethodEnum.CASH);
    expect(lines[0].amount).toBe(19_500);
  });

  it("snapshot rác rơi về nhánh dự phòng thay vì ném lỗi", () => {
    // Cột jsonb không có ràng buộc: dữ liệu sửa tay hay nửa chừng phiên bản cũ
    // vẫn phải mở lại được phiếu.
    expect(() =>
      restore({ items: [item()], draftPayments: [{ amount: 1 }] }),
    ).not.toThrow();

    const lines = restore({
      items: [item()],
      draftPayments: [{ method: "khong-ton-tai", amount: 5 }],
    });
    expect(lines[0].amount).toBe(19_500);
  });

  it("số tiền dạng chuỗi (numeric của Postgres) vẫn về đúng số", () => {
    const lines = restore({
      items: [item()],
      draftPayments: [{ method: "cash", amount: "600000.00" }],
    });

    expect(lines[0].amount).toBe(600_000);
    expect(lines[0].paymentAccountId).toBeNull();
  });
});

describe("openDraftInNewSession — phiếu nháp đổi/trả", () => {
  beforeEach(() => {
    usePosCheckoutSessionStore.getState().resetSession();
  });

  it("AC-06: phiếu EXCHANGE mở lại thành tab đổi trả với hai giỏ đúng chiều", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      invoiceRow({
        type: "EXCHANGE",
        items: [
          item({ direction: "IN" }),
          item({
            id: "item-2",
            itemCode: "SKU-2",
            direction: "OUT",
            unitPrice: 685_000,
            lineDiscount: 205_500,
            lineDiscountType: "percent",
            lineDiscountValue: 30,
            lineDiscountReason: "sale30",
            lineTotal: 479_500,
            sortOrder: 1,
          }),
        ],
      }),
    );

    usePosCheckoutSessionStore.getState().openDraftInNewSession(draft);
    const session = selectActiveSession(usePosCheckoutSessionStore.getState());

    expect(session?.checkoutVariant).toBe(CheckoutVariantEnum.QUICK_EXCHANGE);
    expect(session?.returnCart.map((l) => l.code)).toEqual(["SKU-1"]);
    expect(session?.purchaseCart.map((l) => l.code)).toEqual(["SKU-2"]);
    expect(session?.purchaseCart[0].lineDiscount).toEqual({
      type: "percent",
      value: 30,
      reason: "sale30",
    });
    expect(session?.sourceInvoiceId).toBe("inv-1");
  });

  it("AC-07: phiếu RETURN mở lại với toàn bộ dòng ở giỏ trả, giỏ mua rỗng", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      invoiceRow({ type: "RETURN", items: [item({ direction: "IN" })] }),
    );

    usePosCheckoutSessionStore.getState().openDraftInNewSession(draft);
    const session = selectActiveSession(usePosCheckoutSessionStore.getState());

    expect(session?.checkoutVariant).toBe(CheckoutVariantEnum.QUICK_EXCHANGE);
    expect(session?.returnCart).toHaveLength(1);
    expect(session?.purchaseCart).toEqual([]);
  });

  it("giữ hóa đơn gốc của phiếu lập theo hóa đơn (mode regular)", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      invoiceRow({
        type: "EXCHANGE",
        originalInvoiceId: "orig-1",
        items: [
          item({ direction: "IN", originalInvoiceItemId: "orig-item-1" }),
          item({ id: "item-2", direction: "OUT", sortOrder: 1 }),
        ],
      }),
    );

    usePosCheckoutSessionStore.getState().openDraftInNewSession(draft);
    const session = selectActiveSession(usePosCheckoutSessionStore.getState());

    expect(session?.originalInvoiceId).toBe("orig-1");
    expect(session?.returnCart[0].originalInvoiceItemId).toBe("orig-item-1");
  });

  it("phiếu SALE vẫn mở lại thành đơn bán như trước", () => {
    const draft = mapInvoiceRowToDraftInvoice(
      invoiceRow({ type: "SALE", items: [item({ direction: "OUT" })] }),
    );

    usePosCheckoutSessionStore.getState().openDraftInNewSession(draft);
    const session = selectActiveSession(usePosCheckoutSessionStore.getState());

    expect(session?.checkoutVariant).toBe(CheckoutVariantEnum.SALE);
    expect(session?.purchaseCart).toHaveLength(1);
    expect(session?.returnCart).toEqual([]);
  });
});
