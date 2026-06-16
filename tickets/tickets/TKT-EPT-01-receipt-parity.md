# TKT-EPT-01 Receipt parity: đặt cọc net-out + totalPaid thật + gross Tiền hàng + Khuyến mãi/KM theo mặt hàng

## Epic

[EPIC-16062026 POS "In tạm tính"](../epics/EPIC-16062026-pos-estimate-print.md)

## Summary

Sửa **factory + DTO + renderer dùng chung** để cả "In tạm tính" và "In hóa đơn" in đúng Đặt cọc / Tính vào công nợ / Phương thức thanh toán / Khuyến mãi theo [Image #2]. Thay đổi nguyên tử (DTO + factory + renderer cùng typecheck): nếu chỉ làm một nửa sẽ không build. Gộp luôn phần receipt của TKT-PDC-03 (bỏ `effectiveTotalPaid = 0`).

Bốn sửa đổi:

1. **Đặt cọc (net-out, không dòng):** `deriveInvoiceTotals` nhận `settlementTotal` (đã trừ đặt cọc) thay vì `grandTotal` thô → Trả lại / Khách nợ phản ánh đặt cọc. Không in dòng "Đặt cọc".
2. **Công nợ + phương thức (fold PDC-03):** bỏ `effectiveTotalPaid = debt ? 0 : totalPaid`, dùng `totalPaid` thật cho `paid`, danh sách `payments`, và `deriveInvoiceTotals`.
3. **Khuyến mãi:** "Tiền hàng" = gross (∑ `unitPrice*qty`); thêm trường tổng KM; renderer in dòng "Khuyến mãi" + dòng con "KM theo mặt hàng".
4. **Bỏ** dòng ghi chú "HĐ đã được KM" cuối trang (khuyến mãi đã có trong khối tổng).

## Deliverables

- `apps/pos-web/src/interfaces/invoice-printing.interface.ts`
  - `InvoiceTotals`: `subtotal` đổi ý nghĩa thành **gross** (đã có comment "before … promotion" — chỉ cần factory nạp đúng); thêm `itemDiscountTotal?: number` (KM theo mặt hàng / tổng khuyến mãi).
- `apps/pos-web/src/lib/page-libs/checkout/checkoutReceiptFactory.ts`
  - Thêm tham số input `settlementTotal: number` (net đã trừ đặt cọc).
  - Bỏ `const effectiveTotalPaid = debt ? 0 : totalPaid;` + comment cũ (~dòng 69-72); dùng `totalPaid` thật cho `paid` + `payments`.
  - Tính `grossSubtotal = Σ unitPrice*qty` và `itemDiscountTotal = Σ lineDiscountAmount(line)` từ `cart` (import `lineDiscountAmount` từ `checkoutUtils`).
  - `totals.subtotal = grossSubtotal`; `totals.itemDiscountTotal = itemDiscountTotal > 0 ? itemDiscountTotal : undefined`; `totals.grandTotal = grandTotal` (net, giữ nguyên).
  - `deriveInvoiceTotals({ grandTotal: settlementTotal, totalPaid, keepChange, debt })`.
- `apps/pos-web/src/lib/page-libs/checkout/printing/renderInvoiceHtml.ts`
  - Sau "Tiền hàng", trước "Tổng thanh toán": nếu `totals.itemDiscountTotal > 0` render dòng "Khuyến mãi" (bold) + dòng con "KM theo mặt hàng" (thụt lề).
  - Bỏ khối `.km-line` "HĐ đã được KM" (dòng ~272-278) + CSS `.km-line` không dùng nữa.
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-actions.ts`
  - Lấy `settlementGrandTotal` từ `deriveSettlement` (đã có) → truyền `settlementTotal: settlementGrandTotal` vào `buildCheckoutInvoicePayload`.
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-estimate.ts`
  - Destructure thêm `settlementGrandTotal` từ `deriveSettlement` → truyền `settlementTotal`. (Phần bỏ draft thuộc TKT-EPT-02.)

## Acceptance Criteria

- [ ] Giỏ [Image #2] (gross 2.345.000, KM dòng 213.500, không đặt cọc, debt on): `totals.subtotal === 2_345_000`, `totals.itemDiscountTotal === 213_500`, `totals.grandTotal === 2_131_500`, `customerDebtIssued === 2_131_500`, `change === 0`.
- [ ] Renderer in: "Tiền hàng 2.345.000", "Khuyến mãi 213.500", "KM theo mặt hàng 213.500", "Tổng thanh toán: 2.131.500", "Khách nợ 2.131.500"; **không** còn dòng "HĐ đã được KM".
- [ ] Có đặt cọc 50.000 (không debt, trả đủ phần còn lại): Trả lại / Khách nợ derive từ `settlementTotal = grandTotal − 50.000`; không có dòng "Đặt cọc".
- [ ] Debt + tiền mặt 145.000 (PDC fold): `paid === 145.000`, `payments` liệt kê dòng 145.000, `customerDebtIssued === settlementTotal − 145.000` (không còn "paid 0 / nợ toàn phần").
- [ ] Không có khuyến mãi nào: `itemDiscountTotal` undefined → renderer **không** in dòng "Khuyến mãi"/"KM theo mặt hàng"; "Tiền hàng" = gross = net.
- [ ] Cùng một payload render giống hệt cho `provisional:true` và `false` ngoại trừ tiêu đề "HÓA ĐƠN TẠM TÍNH".

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc typecheck) pass.
- [ ] Parity verify ở flow thủ công (TKT-EPT-03) — cả tạm tính lẫn hóa đơn cuối.
- [ ] Không file backend nào đổi; không `openapi:generate`; `openapi.snapshot.json` không đổi.
- [ ] Named export, không tạo `index.ts`; dùng `@/`/`@erp/pos` alias.
- [ ] Không TODO/FIXME ngoài plan; dọn import/CSS orphan do sửa này tạo ra (`.km-line`, `discountNote` nếu bỏ hẳn).

## Tech Approach

```ts
// checkoutReceiptFactory.ts — input
interface BuildCheckoutInvoicePayloadInput {
  printInvoice: boolean;
  cart: CartLine[];
  grandTotal: number;          // net hiển thị "Tổng thanh toán"
  settlementTotal: number;     // net đã trừ đặt cọc → derive Trả lại/Khách nợ
  totalPaid: number;
  paymentLines: PaymentLine[];
  primaryMethodLabel: string;
  methods: readonly PaymentMethodOption[];
  keepChange: boolean;
  debt: boolean;
  provisional?: boolean;
}

// body
const grossSubtotal = cart.reduce(
  (s, l) => s + Math.abs(l.unitPrice * l.qty),
  0,
);
const itemDiscountTotal = cart.reduce((s, l) => s + lineDiscountAmount(l), 0);

const paid = totalPaid > 0 ? totalPaid : 0;
const payments =
  totalPaid > 0
    ? paymentLines.filter((l) => l.amount > 0).map((l) => ({
        label: resolvePaymentMethodLabel(l.method, methods),
        amount: l.amount,
      }))
    : [{ label: primaryMethodLabel, amount: 0 }];

const t = deriveInvoiceTotals({
  grandTotal: settlementTotal,
  totalPaid,
  keepChange,
  debt,
});

return {
  // ...
  totals: {
    totalQty,
    subtotal: grossSubtotal,
    grandTotal,                                   // net
    itemDiscountTotal: itemDiscountTotal > 0 ? itemDiscountTotal : undefined,
    paid,
    change: t.change,
    keptChange: t.keptChange,
    forgivenShortage: t.forgivenShortage,
    debtReduction: t.debtReduction,
    customerDebtIssued: t.customerDebtIssued,
  },
  payments,
  provisional,
  // ...
};
```

```ts
// renderInvoiceHtml.ts — chèn sau "Tiền hàng", trước ".grand-total"
${
  totals.itemDiscountTotal != null && totals.itemDiscountTotal > 0
    ? `<div class="summary-row bold">
      <span>Khuyến mãi</span>
      <span class="value">${formatVnd(totals.itemDiscountTotal)}</span>
    </div>
    <div class="summary-row" style="padding-left:16px">
      <span>KM theo mặt hàng</span>
      <span class="value">${formatVnd(totals.itemDiscountTotal)}</span>
    </div>`
    : ""
}
```

> `lineDiscountAmount` đã có sẵn ở `checkoutUtils.ts` (percent → % của gross, amount → cố định cap gross). `selectGrandTotal` là net (∑ `lineTotal`) — giữ làm "Tổng thanh toán". Gross tính riêng từ `unitPrice*qty` để khỏi phụ thuộc store.

## Testing Strategy

- Unit (nếu thêm spec cho `checkoutReceiptFactory`, hoặc assert qua flow thủ công): 3 case — (a) KM dòng + debt, (b) đặt cọc + trả đủ, (c) không KM; assert `subtotal`/`itemDiscountTotal`/`grandTotal`/`customerDebtIssued`.
- Manual (TKT-EPT-03): in tạm tính + in hóa đơn cuối, đối chiếu [Image #2].

## Dependencies

- Depends on: `deriveSettlement`/`deriveInvoiceTotals` (`checkoutSettlement.ts`), `lineDiscountAmount` (`checkoutUtils.ts`), renderer.
- Supersedes: phần receipt của TKT-PDC-03 (bỏ `effectiveTotalPaid = 0`).
- Blocks: TKT-EPT-03.
