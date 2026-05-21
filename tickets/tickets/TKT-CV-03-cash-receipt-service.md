# TKT-CV-03 CashReceiptService + Controller

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Service + controller cho Phiếu thu: CRUD DRAFT, post (DRAFT→POSTED), reverse (POSTED→REVERSED + reversal voucher). Đồng thời ship 2 internal method (`createAndPostInternal`, `createVoucherForMovement`) làm nền cho cash-count variance (TKT-CV-06) và Phase 2.

## Deliverables

- `CashReceiptService`:
  - `create(dto)` → INSERT DRAFT + lines.
  - `update(id, dto)` → DRAFT only; full `lines[]` upsert (id có → update; không id → insert; id cũ vắng → delete; `line_order` = index). Diff trong 1 transaction. Validate `total_amount === sum(lines.amount)`.
  - `delete(id)` → soft-delete DRAFT only.
  - `post(id)` → SELECT FOR UPDATE, `DocNumService.generate(CASH_RECEIPT)`, `recordMovement(DEPOSIT)` → movement + JE, UPDATE status=POSTED + link ids.
  - `reverse(id, {reason})` → copy lines giữ amount > 0, movement type=WITHDRAWAL (insufficient → 400), `journalSvc.reverse(originalJEId)`, set `reverses_voucher_id` + `reversal_reason`, original → REVERSED.
  - `createAndPostInternal({purpose, cashAccountId, contraAccountId, partner*, amount, lines?, referenceType, referenceId, actor})` → movement+JE+voucher atomic, return `{voucherId, voucherNumber, cashMovementId, journalEntryId}`.
  - `createVoucherForMovement({cashMovementId, journalEntryId, ...})` → chỉ INSERT voucher document link vào movement+JE có sẵn (KHÔNG tạo movement/JE/balance), return `{voucherId, voucherNumber}`.
- `CashReceiptController` (`@UseGuards(AuthGuard, PermissionGuard)`, `@RequireBranchScope()`): POST/GET/GET:id/PATCH/DELETE + `POST /:id/post` + `POST /:id/reverse`.
- Unit test cho `post`, `reverse`, `createVoucherForMovement`.

## Acceptance Criteria

- [x] Create→post: `cash_accounts.balance` += total; 1 row DEPOSIT `reference = documentNumber`; JE DR cash / CR contra cân bằng.
- [x] Reverse: original=REVERSED + `reversed_by_voucher_id`; reversal POSTED, `total_amount = orig.total > 0`, `reference_type=REVERSAL`, `reference_id=orig.id`, `reversal_reason` lưu; lines copy amount > 0; movement WITHDRAWAL; balance khôi phục; JE đảo DR↔CR.
- [x] Reverse khi `balance < amount` → 400 "Insufficient cash balance", không UPDATE balance.
- [x] Edit/Delete trên POSTED/REVERSED → 400.
- [x] PATCH lines upsert: thêm/sửa/xóa line đúng diff; `line_order` = vị trí array.
- [x] `partner_id` polymorphic: validate tồn tại trong `customers`/`suppliers`/`employees` cùng org → không hợp lệ 400; snapshot `partner_name`/`partner_address` freeze lúc post.
- [x] Permission `accounting.cash_receipt.post` thiếu → 403.
- [x] Multi-tenant: org A không thấy/không thao tác voucher org B.
- [x] `createVoucherForMovement` KHÔNG tạo movement/JE/balance thứ 2 (assert trong test).

## Definition of Done

- [x] Unit test pass: `post` (balance + JE), `reverse` (đảo + insufficient), `createVoucherForMovement` (chỉ link).
- [x] Idempotency interceptor (`X-Idempotency-Key`) wired cho mutation endpoints (xem memory `feedback_idempotent_implementation`).
- [x] Source tiếng Anh.

## Tech Approach

- Reuse `CashService.recordMovement()` (post-TKT-CV-00) cho movement+JE; reuse `JournalService.reverse()`.
- **`createAndPostInternal` mở 1 TX, truyền `manager` xuống `recordMovement(dto, actor, manager)`** để movement+JE+voucher thật sự atomic (recordMovement post-TKT-CV-00 không tự mở nested TX). `journalEntryId` lấy từ return mới `{ movement, journalEntryId }` — KHÔNG dùng `findBySourceRef` ad-hoc.
- `SELECT ... FOR UPDATE` trên cash_account khi post/reverse để chống race balance.
- 2 internal method là contract cho Phase 2 — signature phải khớp EPIC (section A-revised).

## Dependencies

- Phụ thuộc: **TKT-CV-00 (recordMovement TX+jeId refactor)**, TKT-CV-02, TKT-015 (journals), TKT-016/EPIC-009 (CashService), TKT-022 (doc numbering).
- Blocks: TKT-CV-05, TKT-CV-06, TKT-CV-12; Phase 2 (TKT-CV-15/16).
