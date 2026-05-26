# TKT-CV-04 CashPaymentService + Controller

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Đối xứng [TKT-CV-03](./TKT-CV-03-cash-receipt-service.md) cho Phiếu chi. Khác biệt: post() = WITHDRAWAL (chi tiền → cần insufficient-balance check ngay khi post); reverse() = DEPOSIT (trả tiền lại, balance tăng → không cần check). `payee_name` thay `payer_name`.

## Deliverables

- `CashPaymentService`: `create` / `update` (DRAFT upsert lines) / `delete` / `post` / `reverse` + `createAndPostInternal()` + `createVoucherForMovement()` (cùng signature TKT-CV-03).
- `CashPaymentController`: POST/GET/GET:id/PATCH/DELETE + `POST /:id/post` + `POST /:id/reverse`.
- Unit test cho `post` (insufficient balance), `reverse`, `createVoucherForMovement`.

## Acceptance Criteria

- [x] Create→post: balance −= total (insufficient → 400, không UPDATE); 1 row WITHDRAWAL; JE DR contra / CR cash cân bằng.
- [x] Reverse: original=REVERSED; reversal POSTED `total_amount > 0`, `reference_type=REVERSAL`; movement DEPOSIT; balance khôi phục; JE đảo. Không cần insufficient check (balance tăng).
- [x] Edit/Delete trên POSTED/REVERSED → 400.
- [x] `partner_id` polymorphic validate + snapshot lúc post (giống TKT-CV-03).
- [x] Permission `accounting.cash_payment.post` thiếu → 403; multi-tenant cô lập org.
- [x] `createVoucherForMovement` không tạo movement/JE/balance thứ 2.

## Definition of Done

- [x] Unit test pass: `post` insufficient-balance, `reverse`, `createVoucherForMovement`.
- [x] Idempotency interceptor wired cho mutation endpoints.
- [x] Source tiếng Anh.

## Tech Approach

- Mirror TKT-CV-03; chỉ đảo direction movement và vị trí check insufficient balance (post thay vì reverse).
- `purpose` enum dùng `cash_payment_purpose`; `reference_type` dùng `cash_payment_reference_type`.

## Dependencies

- Phụ thuộc: **TKT-CV-00 (recordMovement TX+jeId refactor)**, TKT-CV-02, TKT-015, EPIC-009 (CashService).
- Blocks: TKT-CV-05, TKT-CV-06, TKT-CV-12; Phase 2.
