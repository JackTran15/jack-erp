# TKT-CV-15 Cash voucher consumers (4 consumers)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Module `cash-voucher-consumers/` với 4 consumer tạo voucher document từ event. POS dùng `createAndPostInternal()` (tạo cả accounting); 3 flow A-revised (debt/GR/expense) dùng `createVoucherForMovement()` (chỉ link voucher vào movement+JE có sẵn).

## Deliverables

- `accounting/cash-vouchers/cash-voucher-consumers/`:
  - `pos-cash-sale.consumer.ts` → `CashReceiptService.createAndPostInternal(POS_SALE)` (movement+JE+voucher atomic).
  - `debt-collection-cash.consumer.ts` → `CashReceiptService.createVoucherForMovement(DEBT_COLLECTION)`.
  - `goods-receipt-cash.consumer.ts` → `CashPaymentService.createVoucherForMovement(PURCHASE)`.
  - `expense-cash.consumer.ts` → `CashPaymentService.createVoucherForMovement(EXPENSE)`.
- Mỗi consumer: `tryClaim()` idempotency (`processed_events`) → tạo voucher → publish `CASH_VOUCHER_CREATED`.
- Unit test các nhánh.

> Lưu ý: `pos-cash-sale.consumer.ts` được tạo ở đây dưới dạng consumer mới; việc gỡ binding cũ + verify POS test thuộc TKT-CV-16.

## Acceptance Criteria

- [x] POS consumer: 1 event → 1 row `cash_receipts` (POS_SALE) + 1 movement DEPOSIT + 1 JE (không double).
- [x] Debt/GR/Expense consumer: `createVoucherForMovement` link `cash_movement_id` + `journal_entry_id` có sẵn, **KHÔNG** tạo movement/JE/balance thứ 2 (assert).
- [x] Idempotent: replay cùng eventId → skip + log "already processed".
- [x] Unique violation (replay eventId mới, cùng `(referenceType, referenceId)`) → catch + return existing, không throw.
- [x] Mọi consumer publish `CASH_VOUCHER_CREATED` sau thành công (qua outbox khi TKT-CV-OB3 wired).
- [x] Self-scoped multi-tenant qua `payload.organizationId`.

## Definition of Done

- [x] Unit test: happy path, duplicate event idempotency, unique-violation graceful, `createVoucherForMovement` không tạo movement/JE thứ 2.
- [x] Consumer fail → message vào DLQ (verify); accounting không bị ảnh hưởng.
- [x] Source tiếng Anh.

## Tech Approach

- `@OnDomainEvent` decorator + `EventIdempotencyService` (auto-wrap `processed_events`).
- Map `categoryCode` → category_id; partner snapshot từ payload.

## Dependencies

- Phụ thuộc: TKT-CV-14 (topics/payload), TKT-CV-03/04 (internal methods), TKT-047 (DLQ), TKT-CV-OB1 (outbox schema cho publish).
- Blocks: TKT-CV-16, TKT-CV-18, TKT-CV-22, TKT-CV-23, TKT-CV-OB3.
