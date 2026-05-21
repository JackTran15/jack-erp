# TKT-CV-01 Cash vouchers — schema migration

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Một migration TypeORM duy nhất tạo nền schema cho toàn module: 6 bảng mới + enums + unique index reversal dedupe. **`DocumentType` enum đã có sẵn** `CASH_RECEIPT`/`CASH_PAYMENT`/`CASH_COUNT` (prefix PT/PC/KKQ) trong `@erp/shared-interfaces` — chỉ verify, không extend. Hand-write migration (không dùng `migration:generate` để tránh drift — xem memory `feedback_handwrite_migrations`).

## Deliverables

- 1 migration file `<timestamp>-cash-vouchers-phase1.ts`.
- 6 bảng: `cash_receipts`, `cash_receipt_lines`, `cash_payments`, `cash_payment_lines`, `cash_counts`, `cash_voucher_categories` (schema chi tiết: xem EPIC section "Schema chi tiết").
- Enums: `cash_receipt_status (DRAFT/POSTED/REVERSED)`, `cash_receipt_purpose (OTHER/DEBT_COLLECTION/POS_SALE/OTHER_INCOME)`, `cash_payment_purpose (OTHER/SUPPLIER_PAYMENT/PURCHASE/EXPENSE/SALARY/REFUND)`, `cash_receipt_reference_type (INVOICE/INVOICE_DEBT/RECEIVABLE/MANUAL/REVERSAL)`, `cash_payment_reference_type (INVOICE_DEBT/GOODS_RECEIPT/EXPENSE/SALARY/REFUND/MANUAL/REVERSAL)`, `cash_voucher_category_direction (IN/OUT)`, `cash_count_status (DRAFT/POSTED)`, `cash_count_variance_voucher_kind (CASH_RECEIPT/CASH_PAYMENT)`, `partner_type (CUSTOMER/SUPPLIER/EMPLOYEE/OTHER)`.
- `reversal_reason varchar(500)` nullable trên cả `cash_receipts` và `cash_payments`.
- `cash_counts.expected_amount` + `cash_counts.variance` nullable.
- Unique index reversal dedupe trên cả 2 bảng voucher.
- **Verify** `DocumentType` enum đã có `CASH_RECEIPT`/`CASH_PAYMENT`/`CASH_COUNT` + prefix config (PT/PC/KKQ) — KHÔNG cần extend/rebuild. Nếu muốn đổi prefix `CASH_COUNT` từ `KKQ` → `KK`: chỉnh `DEFAULT_DOC_NUMBER_CONFIG` (quyết định trong PR).
- Down migration đảo ngược sạch (drop bảng + enums). Không động `DocumentType`.

## Acceptance Criteria

- [x] Migration up chạy sạch trên staging có data hiện có; không vỡ bảng `cash_accounts` / `cash_movements` / `journal_entries`.
- [x] Money columns `numeric(18,2)`; PK `uuid`; timestamps UTC; soft-delete `deleted_at`.
- [x] `cash_receipt_lines.amount` / `cash_payment_lines.amount` có `CHECK (amount > 0)`.
- [x] Unique `(organization_id, document_number) WHERE document_number IS NOT NULL` trên cả 2 voucher; unique `(organization_id, code)` trên `cash_voucher_categories`.
- [x] Unique index reversal dedupe tồn tại:
  ```sql
  CREATE UNIQUE INDEX uniq_cash_receipts_reversal
    ON cash_receipts (reference_id)
    WHERE reference_type = 'REVERSAL' AND deleted_at IS NULL;
  -- + uniq_cash_payments_reversal tương tự
  ```
- [x] Indexes `(organization_id, status)`, `(organization_id, voucher_date)`, `(cash_account_id, voucher_date)` trên header.
- [x] FK CASCADE từ `*_lines.{cash_receipt_id|cash_payment_id}` về header; FK RESTRICT về `cash_accounts` / `accounts`.
- [x] `DocumentType` enum (đã có sẵn) import được từ API; `DocNumService.generate(CASH_RECEIPT/CASH_PAYMENT/CASH_COUNT)` ra prefix PT/PC/KKQ.
- [x] `pnpm migration:revert` đưa schema về trạng thái trước migration.

## Definition of Done

- [x] PR có migration file; pass CI lint + build. (Không có DocumentType extension — enum đã sẵn.)
- [x] Migration up + down test trên staging replica, snapshot trước/sau.
- [x] Không có Vietnamese trong source/migration (chỉ tiếng Anh — xem memory `feedback_no_vietnamese_in_backend_source`).

## Tech Approach

- Viết SQL `CREATE TYPE` cho enums trước, `CREATE TABLE` sau, partial unique index cuối.
- `cash_payments.reference_type` ship full enum ngay Phase 1 (gồm REVERSAL) để Phase 2 không phải `ALTER TYPE ... ADD VALUE` (không revert được trong transaction).
- Reversal dedupe index chặn 2 lần `reverse()` concurrent tạo 2 reversal voucher cho cùng original (defense ngoài SELECT FOR UPDATE).
- Entity classes KHÔNG tạo ở ticket này (chỉ schema) — entity ở TKT-CV-02. Nếu TypeORM yêu cầu entity để chạy data-source, tạo skeleton tối thiểu hoặc giữ entity ở TKT-CV-02 và migration thuần SQL.

## Dependencies

- Phụ thuộc: EPIC-009 (`cash_accounts`, `cash_movements`), TKT-022 (DocumentType engine), EPIC-004 (`accounts`, `journal_entries`).
- Blocks: TKT-CV-02 → toàn bộ Phase 1.
