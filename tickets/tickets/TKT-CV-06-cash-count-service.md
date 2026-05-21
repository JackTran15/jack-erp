# TKT-CV-06 CashCountService + Controller

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Kiểm kê tiền mặt: CRUD DRAFT (chỉ nhập số thực tế; expected snapshot lúc POST), post → fill expected + tính variance + auto-create voucher chênh lệch qua internal method của TKT-CV-03/04.

## Deliverables

- `CashCountService`:
  - `create(dto)` → INSERT DRAFT (`actual_amount`, `counted_at`, `notes`, `denominations`; `expected_amount` NULL); response trả `currentBalance` (live `cash_account.balance`, không lưu).
  - `update(id, dto)` → DRAFT only.
  - `post(id)` → `SELECT cash_count FOR UPDATE` + re-check status=DRAFT (POSTED → 400 already posted) → `SELECT cash_account FOR UPDATE` → set `expected_amount = balance`, `variance = actual − expected`:
    - variance > 0 → `CashReceiptService.createAndPostInternal(OTHER_INCOME, contra=TK711)`.
    - variance < 0 → `CashPaymentService.createAndPostInternal(OTHER, contra=TK811)` (insufficient → 400).
    - variance = 0 → không tạo voucher.
    - UPDATE status=POSTED + `variance_voucher_id`/`variance_voucher_kind`/`variance_cash_movement_id` + `document_number` (`KKQ-YY-####`).
- `CashCountController` — POST/GET/GET:id/PATCH + `POST /:id/post`.
- Unit test `post` cả 3 nhánh variance.

## Acceptance Criteria

- [x] DRAFT: `expected_amount` NULL; response create/detail trả `currentBalance`.
- [x] Post: `expected_amount` = balance tại thời điểm post (qua SELECT FOR UPDATE), `variance` đúng.
- [x] variance > 0 → Phiếu thu OTHER_INCOME (TK 711) POSTED; balance tăng phần thừa.
- [x] variance < 0 → Phiếu chi OTHER (TK 811) POSTED; balance giảm; insufficient → 400, count vẫn DRAFT.
- [x] variance = 0 → không tạo voucher, chỉ POSTED.
- [x] Double-post: gọi post 2 lần đồng thời → chỉ 1 thành công (FOR UPDATE + re-check), lần 2 → 400.
- [x] `denominations` (nếu gửi): `sum(denom*count) === actual_amount`, lệch → 400.
- [x] Multi-tenant + permission `accounting.cash_count.*`.

## Definition of Done

- [x] Unit test 3 nhánh variance + double-post + denominations validation.
- [x] Source tiếng Anh.

## Tech Approach

- Reuse `createAndPostInternal()` từ TKT-CV-03/04 (movement+JE+voucher atomic) — không tự build movement.
- **Một TX duy nhất cho `post()`**: `SELECT cash_count FOR UPDATE` + `SELECT cash_account FOR UPDATE` + `createAndPostInternal(…, manager)` phải **chung `manager`**. Nếu `recordMovement` mở TX riêng (pre-TKT-CV-00) sẽ deadlock với chính lock FOR UPDATE ở TX ngoài → bắt buộc TKT-CV-00 xong trước.
- Variance voucher reference: `cash_receipt_reference_type`/`cash_payment_reference_type` **không có value `CASH_COUNT`** → Phase 1 set `reference_type=MANUAL` (hoặc null), KHÔNG trỏ về cash_count. Link trace cash_count↔voucher hai chiều được gom vào epic refactor (xem [EPIC refactor cash-vouchers](../epics/EPIC-21052026-cash-vouchers-followup-refactor.md), issue #9).
- TK 711/811 lấy từ COA (seed bởi TKT-CV-07).

## Dependencies

- Phụ thuộc: **TKT-CV-00 (no-deadlock post)**, TKT-CV-03, TKT-CV-04 (`createAndPostInternal`), TKT-CV-07 (TK 711/811).
- Blocks: TKT-CV-12.
