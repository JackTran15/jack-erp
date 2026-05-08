# TKT-046 Promotion apply service + InvoicePromotion

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Xây dựng `PromotionApplyService` xử lý việc áp dụng ưu đãi (mã giảm giá, voucher, chương trình khuyến mãi) vào một draft invoice. Tạo entity `InvoicePromotionEntity` (junction table) và migration.

## Deliverables

- 1 migration file: `1778500000000-AddInvoicePromotions.ts`
- `InvoicePromotionEntity` (`modules/promotion/invoice-promotion.entity.ts`)
- `PromotionApplyService` (`modules/promotion/promotion-apply.service.ts`)
- Endpoint `POST /invoices/:id/promotions/apply`
- Endpoint `DELETE /invoices/:id/promotions/:promotionId` (gỡ ưu đãi)

## Implementation Status

✅ **COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/modules/promotion/promotion-apply.service.ts`
- `apps/api/src/modules/promotion/promotion.controller.ts` — apply/remove endpoints
- `apps/api/src/modules/promotion/promotion-apply.service.spec.ts` — 14 unit tests

**Lưu ý về endpoint path:** Controller dùng route prefix `promotions/` nên endpoints là:
- `POST /promotions/invoices/:invoiceId/apply`
- `DELETE /promotions/invoices/:invoiceId/:promotionId`

## Acceptance Criteria

- [x] `POST /promotions/invoices/:invoiceId/apply` nhận `{ type, code }` → INSERT `invoice_promotion`, UPDATE `invoice.discount_amount`.
- [x] Chỉ apply được khi invoice `is_draft=true`.
- [x] Validate trước khi apply: mã còn hiệu lực, chưa hết lượt (`discount_code`), chưa dùng (`voucher`), điều kiện tối thiểu đạt (`min_order_value`).
- [x] Stacking: nếu `promotion.conditions.can_stack=false` và đã có promotion → 400.
- [x] Sau khi apply: `invoice.discount_amount` recalculate từ tổng `invoice_promotions.discount_amount`.
- [x] Gỡ ưu đãi `DELETE /promotions/invoices/:invoiceId/:promotionId`: xóa row, recalculate `discount_amount`.
- [x] Khi invoice checkout: `commitPromotions()` được gọi → `voucher.is_used=true`, `discount_code.used_count++`.

## Definition of Done

- [x] PR có entity + service + endpoints; pass CI lint + build + unit tests.
- [x] Unit test: apply discount_code hợp lệ, apply voucher sai customer → 400, stacking conflict → 400, gỡ ưu đãi.
- [ ] Integration test: apply → checkout → verify voucher.is_used=true, discount_code.used_count++. *(chưa viết)*

## Tech Approach

### `invoice_promotions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | |
| `invoice_id` | uuid FK | → invoices |
| `promotion_type` | enum | `discount_code \| voucher \| promotion` |
| `ref_id` | uuid | polymorphic FK — trỏ đến discount_codes/vouchers/promotions |
| `discount_amount` | decimal(18,2) | số tiền được giảm thực tế |
| `note` | text | nullable |

### Apply flow

```
1. Validate invoice is_draft=true
2. Lookup entity theo (promotion_type, code)
3. Validate: còn hiệu lực, đủ điều kiện (min_order_value, customer_tier)
4. Check stacking rule
5. BEGIN TRANSACTION
   a. INSERT invoice_promotion
   b. UPDATE invoice SET discount_amount = SUM(invoice_promotions.discount_amount)
   c. UPDATE invoice SET amount_due = subtotal - discount_amount - deposit_amount
6. COMMIT
```

### Finalize commitment (trong CheckoutInvoiceService)

Khi invoice checkout:
```
- discount_codes: INCREMENT used_count
- vouchers: SET is_used=true, redeemed_invoice_id=invoice.id
```
Được thực hiện trong cùng transaction với checkout (TKT-040).

### Stacking policy

`can_stack=false` trên `PromotionEntity.conditions` — chỉ áp dụng cho type `promotion`. DiscountCode và Voucher luôn có thể kết hợp với nhau và với promotion (trừ khi promotion có `can_stack=false`).

## Testing Strategy

- Unit: mock repositories; test các nhánh validate, stacking check, recalculate discount_amount.
- Integration: draft → apply code → apply voucher → checkout → verify used_count, is_used.

## Dependencies

- Requires: TKT-038 (InvoiceEntity), TKT-040 (CheckoutService — cần gọi commit promotion khi finalize), TKT-045 (3 promotion entities).
- Blocks: (none — ticket cuối trong epic).
