# TKT-CV-16 Refactor CashFromPaymentConsumer (POS)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Di chuyển `CashFromPaymentConsumer` cũ sang `cash-voucher-consumers/pos-cash-sale.consumer.ts` và đổi từ raw `recordMovement` sang `CashReceiptService.createAndPostInternal()` (vẫn tạo movement+JE+voucher trong consumer TX — POS giữ model "consumer tạo tất cả"). Rewire module bindings.

## Deliverables

- Gỡ binding cũ trong `accounting.module.ts` (`apps/api/src/modules/accounting/consumers/cash-from-payment.consumer.ts`).
- Consumer mới `cash-voucher-consumers/pos-cash-sale.consumer.ts` dùng `createAndPostInternal(POS_SALE, referenceType=INVOICE, referenceId=invoiceId)`.
- Add binding trong `cash-vouchers.module.ts`.
- Topic giữ nguyên `erp.cash.movement.from.payment`.

## Acceptance Criteria

- [x] POS cash sale → 1 row `cash_receipts` (POS_SALE, referenceType=INVOICE, referenceId=invoiceId, status=POSTED, `PT-YY-####`) + đúng 1 movement DEPOSIT + JE cân bằng.
- [x] Không có double movement (consumer cũ + mới chạy song song) — chỉ 1 binding active.
- [x] Existing POS checkout test vẫn pass.
- [x] Backward compat: `cash_movements` cũ (trước Phase 2) vẫn render trong ledger với `(Không có chứng từ)`.

## Definition of Done

- [x] POS regression test pass; chỉ 1 cash_movement per cash sale.
- [x] Old consumer file removed/relocated, không còn binding mồ côi.
- [x] Source tiếng Anh.

## Tech Approach

- Giữ asymmetry: POS dùng `createAndPostInternal` (JE thuần DR cash / CR revenue đặt ở consumer như cũ), khác 3 flow A-revised dùng `createVoucherForMovement`.
- Publish `CASH_VOUCHER_CREATED` sau tạo (link consumer cho POS = no-op; trace ngược qua `reference_id = invoiceId`).

## Dependencies

- Phụ thuộc: TKT-CV-15 (consumer module), TKT-CV-03 (`createAndPostInternal`).
- Blocks: TKT-CV-23, TKT-CV-OB3.
