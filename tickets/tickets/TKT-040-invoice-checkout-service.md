# TKT-040 Invoice checkout service (draft → paid | debt)

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Xây dựng `CheckoutInvoiceService` xử lý việc finalize một draft invoice sang trạng thái `paid` hoặc `debt`. Endpoint `POST /invoices/:id/checkout`.

## Deliverables

- `modules/pos/services/checkout-invoice.service.ts`
- `modules/pos/dto/checkout-invoice.dto.ts`
- Endpoint `POST /invoices/:id/checkout` trong controller

## Implementation Status

✅ **COMPLETED** — 2026-05-07 (enhanced beyond original scope)

Files delivered:
- `apps/api/src/modules/pos/services/checkout-invoice.service.ts`
- `apps/api/src/modules/pos/dto/checkout-invoice.dto.ts` — thêm `cashAccountId`, `revenueAccountId`
- `apps/api/src/modules/pos/services/checkout-invoice.service.spec.ts` — 18 unit tests

**Scope mở rộng so với ticket gốc:**
- Validate stock availability trước khi write
- `stockLedgerService.recordBatchMovements()` (SALE_ISSUE) — trừ kho sau commit
- Compensating transaction: nếu stock movement thất bại → revert invoice về DRAFT + xóa debt
- `journalService.post()` — ghi sổ kế toán (non-critical, log error nếu fail)
- `eventPublisher.publish(SALE_POSTED)` — Kafka event
- `wsEmitter.emitToBranch(POS_CHECKOUT_ACKNOWLEDGED)` — WebSocket

## Acceptance Criteria

- [x] Chỉ invoice `is_draft=true` mới checkout được; nếu không → 400.
- [x] Sau checkout: `is_draft=false`, `status=paid|debt`, `issued_at` set.
- [ ] `session_id` cleared. *(không clear — giữ lại để trace)*
- [x] Nếu `payment_method=debt`: gọi `InvoiceDebtService.createFromInvoice()` trong cùng transaction → tạo `invoice_debt` row.
- [x] Nếu `payment_method != debt`: không tạo `invoice_debt`.
- [x] `amount_due` được tính lại từ `subtotal - discount_amount - deposit_amount` trước khi finalize.
- [x] `code` được gen từ `DocumentNumberingModule` (`DocumentType.INVOICE`).
- [x] Rollback stock + revert invoice về DRAFT nếu stock movement thất bại.

## Definition of Done

- [x] PR có service + DTO + endpoint; pass CI lint + build + unit tests.
- [x] Unit test: checkout → paid, checkout → debt (gọi DebtService), checkout invoice đã paid → 400, stock fail → revert, journal fail → không throw.
- [ ] Integration test (optional): tạo draft → checkout → verify `invoice_debt` tồn tại. *(chưa viết)*

## Tech Approach

### Checkout flow

```
1. Load invoice (guard: is_draft=true)
2. Recalculate amount_due
3. BEGIN TRANSACTION
   a. UPDATE invoice SET is_draft=false, status=?, issued_at=NOW(), payment_method=?, ...
   b. IF payment_method=debt:
        INSERT invoice_debt (original_amount=amount_due, remaining_amount=amount_due, ...)
4. COMMIT
```

### DTO

```typescript
class CheckoutInvoiceDto {
  paymentMethod: InvoicePaymentMethod;   // cash | bank_transfer | card | debt
  cashTendered?: number;                 // required nếu paymentMethod=cash
  depositAmount?: number;
  note?: string;
}
```

### Atomicity

Dùng `DataSource.transaction(queryRunner => ...)` — không dùng 2 request riêng biệt.

## Testing Strategy

- Unit: mock `DataSource`, `InvoiceDebtService`; test các nhánh paid / debt / error rollback.
- Staging: tạo draft thủ công → gọi checkout → verify bằng `psql` SELECT.

## Dependencies

- Requires: TKT-038 (entities), TKT-039 (CRUD API), TKT-043 (InvoiceDebtService).
- Blocks: TKT-046 (promotion apply — cần biết invoice đã finalized).
