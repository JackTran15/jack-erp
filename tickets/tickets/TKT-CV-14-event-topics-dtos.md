# TKT-CV-14 Event topics + payload DTOs

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Định nghĩa topic constants + event payload interfaces cho auto-create flow trong `@erp/shared-kafka-client` + `@erp/shared-interfaces`. Rename POS const giữ string cũ (backward-compatible).

## Deliverables

- `packages/shared-kafka-client/src/topics.ts`:
  ```ts
  CASH_VOUCHER_NEEDED_POS_SALE      = 'erp.cash.movement.from.payment'  // giữ string; deprecated alias CASH_MOVEMENT_FROM_PAYMENT
  CASH_VOUCHER_NEEDED_DEBT_PAYMENT  = 'erp.cash.voucher.needed.debt_payment'
  CASH_VOUCHER_NEEDED_GOODS_RECEIPT = 'erp.cash.voucher.needed.goods_receipt'
  CASH_VOUCHER_NEEDED_EXPENSE       = 'erp.cash.voucher.needed.expense'
  CASH_VOUCHER_CREATED              = 'erp.cash.voucher.created'
  ```
- `@erp/shared-interfaces` payload types: `CashMovementFromPaymentPayload` (POS, giữ nguyên), `CashVoucherNeededPayload` (carry `cashMovementId` + `journalEntryId`), `CashVoucherCreatedPayload` (xem EPIC "Event payload schemas").
- Rebuild shared packages.

## Acceptance Criteria

- [x] Const rename không đổi giá trị string topic POS (`erp.cash.movement.from.payment`) → không vỡ consumer/producer hiện có.
- [x] Deprecated alias `CASH_MOVEMENT_FROM_PAYMENT` vẫn export, trỏ cùng string.
- [x] Payload interfaces import được từ API + đúng field theo EPIC.
- [x] `pnpm build:shared` xanh; API typecheck pass.

## Definition of Done

- [x] PR cập nhật topics + payload types + rebuild; pass build.
- [x] `TopicInitializer` tạo topic mới khi app start (verify danh sách topic).

## Tech Approach

- Theo pattern shared-kafka-client (TKT-021).
- `eventId` deterministic được tạo phía producer (TKT-CV-OB3), không ở đây — đây chỉ là type + topic name.

## Dependencies

- Phụ thuộc: TKT-CV-13, TKT-021 (kafka client), TKT-047 (DLQ/event infra).
- Blocks: TKT-CV-15, TKT-CV-16, TKT-CV-17, TKT-CV-18.
