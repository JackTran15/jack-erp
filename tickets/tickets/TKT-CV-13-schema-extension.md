# TKT-CV-13 Phase 2 — schema extension migration

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Migration mở rộng schema cho auto-create flow: unique constraint chống voucher trùng trên 2 bảng voucher, cột `payment_method` + cash/JE link trên `goods_receipts` / `expenses` / `debt_payments`. Hand-write migration.

## Deliverables

- Unique index chống trùng (cho phép re-issue sau REVERSED):
  ```sql
  CREATE UNIQUE INDEX uniq_cash_receipts_reference
    ON cash_receipts (organization_id, reference_type, reference_id)
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
      AND status != 'REVERSED' AND deleted_at IS NULL;
  -- + uniq_cash_payments_reference tương tự
  ```
- `goods_receipts`: `payment_method` enum (CASH, CREDIT) nullable, `cash_account_id` uuid nullable FK, `journal_entry_id` uuid nullable FK (nếu chưa có); **bỏ** `contra_account_id` (contra CASH = inventory account, derive ở service); verify `cash_payment_id` tồn tại (entity hiện có — add nếu DB thiếu).
- `expenses`: `payment_method` enum (CASH, BANK, PAYABLE) nullable, `cash_account_id` uuid nullable FK, `cash_payment_id` uuid nullable FK, `journal_entry_id` nullable FK (nếu chưa có).
- `debt_payments`: `cash_receipt_id` uuid nullable FK, `journal_entry_id` nullable FK.
- Down migration đảo ngược sạch.

## Acceptance Criteria

- [x] Migration up sạch trên data Phase 1; rows cũ `payment_method` NULL.
- [x] Unique constraint chặn 2 voucher cùng `(org, referenceType, referenceId)` non-REVERSED; cho phép tạo mới sau khi original REVERSED.
- [x] Reversal voucher (`reference_type=REVERSAL`) không bị `uniq_*_reference` chặn nhầm (đã có index `uniq_*_reversal` riêng từ TKT-CV-01).
- [x] `goods_receipts.contra_account_id` đã drop (nếu trước đó tồn tại); không còn code nào đọc cột này.
- [x] FK mới trỏ đúng bảng; `pnpm migration:revert` đưa schema về Phase 1.

## Definition of Done

- [x] Prerequisite check (ghi trong PR): `GoodsReceiptService.post()` / `InvoiceDebtService.collectPayment()` hiện có tạo JE chưa — A-revised yêu cầu source tạo JE qua `recordMovement` khi CASH (ảnh hưởng TKT-CV-17).
- [x] Migration up + down test trên staging.
- [x] Source tiếng Anh.

## Tech Approach

- `ALTER TYPE ... ADD VALUE` không revert trong transaction → tạo enum mới qua `CREATE TYPE` riêng cho `goods_receipt_payment_method` / `expense_payment_method`.
- Verify cột tồn tại trước khi add (idempotent guard) cho `cash_payment_id` / `journal_entry_id`.
- **Tên bảng đúng**: entity `DebtPaymentEntity` → table **`debt_payments`** (KHÔNG phải `invoice_debt_payments`); bảng đã có sẵn cột `paymentMethod` enum (`cash`/`bank_transfer`) — Phase 2 chỉ add `cash_receipt_id` + `journal_entry_id`. `goods_receipts` đã có sẵn `cash_payment_id` **và** `cash_receipt_id` (chỉ cần add `payment_method`/`cash_account_id`/`journal_entry_id`).

## Dependencies

- Phụ thuộc: Phase 1 hoàn thành (TKT-CV-01..07, 12).
- Blocks: TKT-CV-14, TKT-CV-17, TKT-CV-23.
