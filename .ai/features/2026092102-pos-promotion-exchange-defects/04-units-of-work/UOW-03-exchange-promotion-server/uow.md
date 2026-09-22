---
id: UOW-03
slug: exchange-promotion-server
title: Server — phiếu đổi áp CTKM cho dòng mua thêm, ghi snapshot, tính net / điểm trên số sau KM
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-03]
verifies: [AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-28]
risk: high
status: todo
rollback: revert commit T-03-02/T-03-03 (service + DTO); phiếu đổi đã post trong lúc bật giữ nguyên (bất biến), snapshot của chúng vẫn đọc được qua GET /invoices/:id; T-03-01 (tách helper) giữ được vì không đổi hành vi
---

# UOW-03 — Phiếu đổi áp CTKM cho dòng mua thêm

## Demo script
1. `pnpm --filter @erp/api test:e2e -- exchange-promotion` xanh — 11 AC, mỗi AC một `it`.
2. Trên DB :4000 (hoặc `erp_test` sau e2e): `SELECT direction, line_total, promotion_discount FROM invoice_items WHERE invoice_id = '<E>'` → dòng OUT SKU-100 `promotion_discount = 60000`, `line_total = 200000`; dòng IN `promotion_discount = 0`.
3. `SELECT name, discount_amount, line_discounts FROM invoice_checkout_promotions WHERE invoice_id = '<E>'` → 1 dòng, `line_discounts[0].lineId` = id dòng OUT.
4. `SELECT net_amount, refunded_amount, discount_amount, points_earned FROM invoices WHERE id = '<E>'` → `-545000 / 545000 / 60000 / floor(140000/rate)`.
5. `curl POST /invoices/<Q2>/checkout-return` với `excludedProgramIds: [P]` → `netAmount` bằng giá niêm yết, không snapshot.
6. `curl GET /invoices/<Q>/eligible-returns` → dòng SKU-685 mua thêm có `refundableUnitPrice 479500`, `promotions[0].unitDiscount 205500` (trả lại món mua thêm hoàn đúng số đã trả).
7. `curl GET /invoices/<Q>` → `appliedPromotions[0].lineDiscounts[0].lineId` = id dòng OUT.
8. Tạo draft E2 giống E, `curl POST /invoices/<E2>/checkout-return/preview -d '{}'` → 7 số (`netAmount -545000`); `SELECT` E2 vẫn draft, không snapshot; post E2 → `netAmount` bằng preview.

## In scope
- `CheckoutReturnDto.selectedProgramIds/excludedProgramIds`.
- `CheckoutReturnService`: evaluate dòng OUT (ADR-01), `ComputedTotals.newPromotionDiscount/newNet`, `netAmount`/`refundedAmount`/`pointsEarned`/loyalty award trên `newNet`, `discountAmount` header, ghi `promotionDiscount` + snapshot (ADR-02).
- Helper ghi CTKM dùng chung với saga.
- `POST /invoices/:id/checkout-return/preview` (dry-run, ADR-03).
- OpenAPI regen.

## Not in scope
- Dòng quà tặng cho phiếu đổi (A-06), voucher, dùng điểm.
- Đánh giá CTKM cho dòng IN.
- Đổi ma trận `validateRefundMatrix`.

## Risks
| Risk | Mitigation |
| --- | --- |
| Tách helper khỏi `persist-invoice.step.ts` làm saga đổi hành vi | T-03-01 chỉ di chuyển mã; `persist-invoice.step.spec.ts` + `checkout-saga-promotion.e2e-spec.ts` phải xanh nguyên trạng trước khi T-03-03 dùng helper |
| `computeReverseBase`/`computeReversePoints`/`computeRedeemedCreditBack` đọc `totals.newSubtotal` gián tiếp | Grep mọi `totals.newSubtotal` trong service; chỉ hai chỗ (pointsEarned, loyalty award) đổi sang `newNet`; `invoice.subtotal` giữ `newSubtotal` (bất biến `subtotal = Σ lineTotal`) |
| `fanOutEvents` chạy sau transaction đọc `totals` — nếu evaluate ném lỗi thì không có gì để rollback vì chưa vào transaction | Evaluate đặt trước `computeTotals`, trước `dataSource.transaction` (ADR-01) |
| `checkout-return.service.spec.ts` dựng module bằng `Test.createTestingModule` — thêm `QueryBus` làm mọi case cũ đỏ | T-03-02 thêm provider `{ provide: QueryBus, useValue: { execute: jest.fn().mockResolvedValue(<evaluation rỗng>) } }` để case cũ giữ `promotionDiscount = 0` |

## Definition of done
- [x] AC-10..AC-19 và AC-28 mỗi AC một `it` xanh trong `exchange-promotion.e2e-spec.ts` (11/11, 2 lần liên tiếp)
- [x] `checkout-return.service.spec.ts` 90/90 (case cũ nguyên trạng), `persist-invoice.step.spec.ts` 23/23 không sửa, `checkout-saga-promotion` 13/13, `quick-exchange-line-discount` PASS
- [x] `pnpm openapi:generate`: diff chỉ 2 field `CheckoutReturnDto` + path preview + `CheckoutReturnPreviewDto`/`CheckoutReturnPreviewResponseDto`
- [x] `tsc --noEmit` api xanh
- [x] Không file nào ngoài `touches:` của T-03-01..T-03-06 bị đụng (scope 0 drift)
- [ ] Demo script chạy trước Akenzy
