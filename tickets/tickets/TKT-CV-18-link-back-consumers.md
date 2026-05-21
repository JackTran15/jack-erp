# TKT-CV-18 Link-back consumers (FK back-fill)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

3 consumer nằm trong source module, lắng nghe `CASH_VOUCHER_CREATED` để set FK back-link từ source record về voucher. Nằm ở source module để cash-vouchers không phụ thuộc entity của source (no cyclic dependency).

## Deliverables

- `pos/consumers/debt-payment-voucher-link.consumer.ts` → UPDATE `debt_payments.cash_receipt_id`.
- `inventory/goods-receipt/consumers/goods-receipt-voucher-link.consumer.ts` → UPDATE `goods_receipts.cash_payment_id`.
- `accounting/expenses/consumers/expense-voucher-link.consumer.ts` → UPDATE `expenses.cash_payment_id`.
- Mỗi consumer filter event theo `payload.sourceType`; idempotent qua `processed_events`.

## Acceptance Criteria

- [x] Debt CASH: sau ≤ 2s `debt_payments.cash_receipt_id` được set đúng voucherId.
- [x] GR CASH: sau ≤ 2s `goods_receipts.cash_payment_id` set.
- [x] Expense CASH: sau ≤ 2s `expenses.cash_payment_id` set.
- [x] POS_SALE event → các link consumer no-op (filter theo sourceType, không update nhầm).
- [x] Idempotent: replay → skip (không lỗi).
- [x] Link consumer fail → DLQ; voucher vẫn tồn tại độc lập trong ledger (chỉ thiếu FK back-link).

## Definition of Done

- [x] Unit test 3 consumer: happy path + duplicate event + filter sourceType.
- [x] Ops back-fill query documented (xem EPIC "Failure semantics").
- [x] Source tiếng Anh.

## Tech Approach

- Listen `CASH_VOUCHER_CREATED`; switch theo `sourceType` để chọn consumer xử lý.
- UPDATE đơn giản, không tạo movement/JE.

## Dependencies

- Phụ thuộc: TKT-CV-15 (publish `CASH_VOUCHER_CREATED`), TKT-CV-17 (source có FK column), TKT-CV-13 (cột `cash_receipt_id`/`cash_payment_id`).
- Blocks: TKT-CV-23.
