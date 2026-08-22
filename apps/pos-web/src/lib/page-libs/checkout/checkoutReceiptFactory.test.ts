import { describe, expect, it } from "vitest";

import { buildCheckoutInvoicePayload } from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import { buildInvoiceRowPrintPayload } from "@erp/pos/lib/page-libs/invoice-list/invoiceRowPrintPayload";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
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

/**
 * T-02-03 — biên lai dựng lúc thanh toán **không** được mang số. Số hoá đơn chỉ
 * có sau khi `/checkout` trả về, và `use-checkout-actions` gán vào ngay trước
 * khi in. Trước đây chỗ này sinh số ngẫu nhiên bằng `Math.random()`, nên tờ giấy
 * khách cầm về mang một con số tra không ra hoá đơn nào.
 */
describe("buildCheckoutInvoicePayload — số hoá đơn", () => {
  it("không tự sinh số: biên lai dựng ra chưa có invoiceNumber", () => {
    const payload = buildPayload(0, 100_000);

    // `toBeUndefined`, không phải `toBeFalsy`: chuỗi rỗng cũng falsy, mà ở đây
    // trường phải vắng mặt hẳn.
    expect(payload?.invoiceNumber).toBeUndefined();
  });

  it("dựng hai lần liên tiếp cho ra hai biên lai giống hệt nhau", () => {
    const first = buildPayload(0, 100_000);
    const second = buildPayload(0, 100_000);

    // Test này là thứ sẽ đỏ nếu ai đó đưa Math.random() trở lại.
    expect(first?.invoiceNumber).toBe(second?.invoiceNumber);
    expect({ ...first, issuedAt: null }).toEqual({ ...second, issuedAt: null });
  });
});

/**
 * Bất biến của cả feature: hai đường in **cùng một hoá đơn** phải ra cùng một số.
 * `invoiceRowPrintPayload` (in lại từ danh sách) đọc `invoice.code`; đường thanh
 * toán được `use-checkout-actions` gán đúng `code` đó. Hai tờ giấy khớp nhau khi
 * và chỉ khi cả hai cùng lấy từ một nguồn.
 */
describe("hai đường in cùng một hoá đơn ra cùng một số (AC-11)", () => {
  const CODE = "2608210001";

  const savedInvoice = {
    id: "inv-1",
    code: CODE,
    status: "paid",
    type: "SALE",
    isDraft: false,
    sessionId: "sess-1",
    staffId: "staff-1",
    subtotal: 100_000,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 100_000,
    totalPaid: 100_000,
    netAmount: 0,
    items: [
      {
        id: "it-1",
        itemName: "Sản phẩm A",
        itemCode: "SP001",
        quantity: 1,
        unitPrice: 100_000,
        lineDiscount: 0,
        lineTotal: 100_000,
        direction: "OUT",
      },
    ],
  } as unknown as InvoiceRow;

  it("đường in lại lấy số từ invoice.code", () => {
    expect(buildInvoiceRowPrintPayload(savedInvoice).invoiceNumber).toBe(CODE);
  });

  it("đường thanh toán, sau khi được gán code, khớp đúng đường in lại", () => {
    const atCheckout = buildPayload(0, 100_000)!;
    // Đúng một dòng mà use-checkout-actions chạy sau khi /checkout trả về.
    atCheckout.invoiceNumber = savedInvoice.code;

    expect(atCheckout.invoiceNumber).toBe(
      buildInvoiceRowPrintPayload(savedInvoice).invoiceNumber,
    );
  });
});
