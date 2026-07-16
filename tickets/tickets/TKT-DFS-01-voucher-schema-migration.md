# TKT-DFS-01 Migration bảng chứng từ tiền gửi (bank_receipts / bank_payments)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

Migration hand-written tạo 4 bảng chứng từ cấp document cho quỹ tiền gửi — `bank_receipts` / `bank_receipt_lines`
(Phiếu thu, prefix `NTTK`) và `bank_payments` / `bank_payment_lines` (Phiếu chi, prefix `UNC`) — **mirror 1:1**
schema `cash_receipts` / `cash_receipt_lines` và `cash_payments` / `cash_payment_lines`, cộng các cột đặc thù tiền gửi.
Mỗi voucher **bắt buộc** `deposit_account_id` (gap FR-04 "Tài khoản nhận" / FR-05 "Tài khoản chi", ref.md §13),
và khi POST link vào một `deposit_movements` + một `journal_entries`. Đây là bảng nền cho DFS-02..06.

## Deliverables

- `apps/api/src/database/migrations/1786600000000-DepositVouchersSchema.ts` — migration hand-written (đặt timestamp
  **sau** migrations của GĐ1 foundation; điều chỉnh nếu foundation lấy số cao hơn). Tạo:
  - **Enum types** (Postgres `CREATE TYPE`, giá trị English-only):
    - `bank_voucher_status_enum` = `('DRAFT','PENDING_APPROVAL','POSTED','REVERSED')` (PENDING_APPROVAL cho BR-CHI-03, chỉ dùng ở payments).
    - `bank_receipt_purpose_enum` = `('OTHER','DEBT_COLLECTION','OTHER_INCOME','INTER_BRANCH_IN')` (FR-04; INTER_BRANCH_IN = stub GĐ4 FR-07).
    - `bank_receipt_reference_type_enum` = `('INVOICE_DEBT','RECEIVABLE','TRANSFER','MANUAL','REVERSAL')`.
    - `bank_payment_purpose_enum` = `('SUPPLIER_PAYMENT','PURCHASE','EXPENSE','CASH_TRANSFER','INTER_BRANCH_OUT','REFUND','BANK_FEE','OTHER')` (ref.md §6.5 full set).
    - `bank_payment_reference_type_enum` = `('GOODS_RECEIPT','PAYABLE','INVOICE','TRANSFER','EXPENSE','MANUAL','REVERSAL')` (ship full enum up front).
    - `bank_voucher_partner_type_enum` = `('CUSTOMER','SUPPLIER','EMPLOYEE','OTHER')`.
  - **`bank_receipts`** (mirror `cash_receipts`): `id uuid PK`, `organization_id uuid`, `branch_id uuid`,
    `deposit_account_id uuid NOT NULL` (FK `deposit_accounts`), `document_number varchar`, `purpose bank_receipt_purpose_enum`,
    `status bank_voucher_status_enum DEFAULT 'DRAFT'`, `doc_date date`, `payer_name varchar`, `payer_address varchar`,
    `partner_type bank_voucher_partner_type_enum NULL`, `partner_id uuid NULL`, `reason varchar`, `collected_by varchar`,
    `reference varchar NULL`, `affect_revenue boolean DEFAULT false`, `contra_account_id uuid NULL`, `total_amount numeric(18,2)`,
    `reference_type bank_receipt_reference_type_enum NULL`, `reference_id uuid NULL`,
    `deposit_movement_id uuid NULL` (FK `deposit_movements`), `journal_entry_id uuid NULL` (FK `journal_entries`),
    `reverses_voucher_id uuid NULL`, `reversed_by_voucher_id uuid NULL`, `reversal_reason text NULL`,
    `created_at`, `updated_at`, `deleted_at NULL` (soft-delete).
  - **`bank_receipt_lines`** (mirror `cash_receipt_lines`): `id uuid PK`, `bank_receipt_id uuid` (FK, `ON DELETE CASCADE`),
    `description varchar`, `amount numeric(18,2) CHECK (amount > 0)`, `category_id uuid NULL`, `reference_note varchar NULL`,
    `created_at`, `updated_at`.
  - **`bank_payments`** (mirror `cash_payments`): giống `bank_receipts` với `purpose bank_payment_purpose_enum`,
    `reference_type bank_payment_reference_type_enum NULL`, `payee_name` / `payee_address` thay `payer_*`, `paid_by varchar`,
    `affect_expense boolean DEFAULT false`, và thêm `approval_status varchar NULL` + `approved_by uuid NULL` + `approved_at timestamptz NULL`
    (BR-CHI-03 stub, gated OQ-08).
  - **`bank_payment_lines`** (mirror `cash_payment_lines`): giống `bank_receipt_lines`, FK `bank_payment_id`.
  - **Indexes** (mirror cash exactly):
    - `uniq_bank_receipts_org_document_number ON bank_receipts (organization_id, document_number) WHERE document_number IS NOT NULL`.
    - `uniq_bank_receipts_reversal ON bank_receipts (reference_id) WHERE reference_type = 'REVERSAL' AND deleted_at IS NULL` (1 reversal / original).
    - `uniq_bank_receipts_reference ON bank_receipts (organization_id, reference_type, reference_id) WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL AND status != 'REVERSED' AND deleted_at IS NULL` (anti-duplicate, cho phép re-issue sau REVERSED).
    - Bộ 3 index tương tự cho `bank_payments`.
    - Perf index: `idx_bank_receipts_scope ON bank_receipts (organization_id, branch_id, deposit_account_id, doc_date, id)` + tương tự payments (NFR-01).
  - `down()`: drop indexes → tables (payment_lines, payments, receipt_lines, receipts) → enum types, đảo thứ tự `up()`.

## Acceptance Criteria

- [ ] `pnpm migration:run` tạo đủ 4 bảng + 6 enum types + tất cả index; `pnpm migration:revert` rollback sạch (down đối xứng).
- [ ] `bank_receipts.deposit_account_id` và `bank_payments.deposit_account_id` là `NOT NULL` với FK tới `deposit_accounts` (gap ref.md §13 — "Tài khoản nhận / Tài khoản chi" bắt buộc).
- [ ] Tiền dùng `numeric(18,2)` (NFR-06 no float); PK `uuid`; `created_at`/`updated_at` UTC; `deleted_at` soft-delete trên header.
- [ ] `bank_receipt_lines.amount` / `bank_payment_lines.amount` có `CHECK (amount > 0)` (BR-THU-01: giữ dòng dương, reversal copy giữ dương).
- [ ] Index reversal-dedupe partial unique chặn 2 reversal cho cùng original (mirror `uniq_cash_receipts_reversal`).
- [ ] Index reference partial unique chặn double chứng từ cùng `(org, reference_type, reference_id)` khi chưa REVERSED (mirror `uniq_cash_receipts_reference`).
- [ ] Enum `bank_payment_purpose_enum` chứa `SUPPLIER_PAYMENT`/`PURCHASE` (option "Trả NCC / Mua hàng" thiếu ở ref.md §13) và `CASH_TRANSFER`/`INTER_BRANCH_OUT`/`BANK_FEE`/`REFUND`/`EXPENSE`/`OTHER`.
- [ ] `synchronize` vẫn false; bảng `cash_*` hiện có **không** bị đụng (chỉ thêm bank_*).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] `pnpm migration:run` → `pnpm migration:revert` chạy sạch trên DB local; `pnpm migration:show` xác nhận applied/reverted.
- [ ] Không có schema change ngoài migration này; `synchronize` stays false.
- [ ] Không có tiếng Việt trong backend source (chỉ ticket prose).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Hand-written migration mirroring `1781000000000-CashVouchersPhase1.ts` (cùng repo) + partial-unique index mirroring
`1781200000000-CashVouchersPhase2Schema.ts:19-30`. Không dùng `migration:generate` (drift lớn — xem memory
"Hand-write migrations"): trích cấu trúc bảng cash rồi viết tay cho bank.

```ts
export class DepositVouchersSchema1786600000000 implements MigrationInterface {
  name = 'DepositVouchersSchema1786600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "bank_voucher_status_enum" AS ENUM ('DRAFT','PENDING_APPROVAL','POSTED','REVERSED')`);
    await q.query(`CREATE TYPE "bank_receipt_purpose_enum" AS ENUM ('OTHER','DEBT_COLLECTION','OTHER_INCOME','INTER_BRANCH_IN')`);
    await q.query(`CREATE TYPE "bank_payment_purpose_enum" AS ENUM ('SUPPLIER_PAYMENT','PURCHASE','EXPENSE','CASH_TRANSFER','INTER_BRANCH_OUT','REFUND','BANK_FEE','OTHER')`);
    // ...reference_type + partner_type enums...

    await q.query(`
      CREATE TABLE "bank_receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "deposit_account_id" uuid NOT NULL,             -- FR-04 "Tài khoản nhận" (required; gap §13)
        "document_number" character varying,
        "purpose" "bank_receipt_purpose_enum" NOT NULL,
        "status" "bank_voucher_status_enum" NOT NULL DEFAULT 'DRAFT',
        "doc_date" date NOT NULL,
        "total_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "deposit_movement_id" uuid, "journal_entry_id" uuid,
        "reference_type" "bank_receipt_reference_type_enum", "reference_id" uuid,
        "reverses_voucher_id" uuid, "reversed_by_voucher_id" uuid, "reversal_reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_bank_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bank_receipts_deposit_account" FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id"),
        CONSTRAINT "FK_bank_receipts_movement" FOREIGN KEY ("deposit_movement_id") REFERENCES "deposit_movements"("id")
      )`);
    // bank_receipt_lines with CHECK (amount > 0) and ON DELETE CASCADE
    // bank_payments (payee_*, affect_expense, approval_status/approved_by/approved_at) + bank_payment_lines
    await q.query(`CREATE UNIQUE INDEX "uniq_bank_receipts_reversal" ON "bank_receipts" ("reference_id") WHERE "reference_type" = 'REVERSAL' AND "deleted_at" IS NULL`);
    await q.query(`CREATE UNIQUE INDEX "uniq_bank_receipts_reference" ON "bank_receipts" ("organization_id","reference_type","reference_id") WHERE "reference_type" IS NOT NULL AND "reference_id" IS NOT NULL AND "status" != 'REVERSED' AND "deleted_at" IS NULL`);
    // ...same three indexes for bank_payments + scope perf indexes...
  }

  public async down(q: QueryRunner): Promise<void> { /* drop indexes → tables → enum types, reverse order */ }
}
```

Lưu ý: `deposit_account_id` reference `deposit_accounts` (GĐ1). Nếu foundation chưa merge khi implement ticket này,
FK sẽ fail — DFS-01 **depends on** foundation migration đã chạy (xem Dependencies). `transactionMode='each'` (memory
"Migrations transaction mode each") đã bật ở `data-source.ts` — enum tạo rồi dùng trong cùng batch không cần lo 55P04.

## Testing Strategy

- Không unit test service (chỉ schema). Verify bằng `pnpm migration:run` + `pnpm migration:revert` local (round-trip).
- Kiểm tra thủ công qua Adminer (:18088): 4 bảng + 6 enum types tồn tại; thử insert 2 reversal cùng `reference_id` → vi phạm unique.
- E2E của DFS-09 (erp_test) sẽ chạy migration này ở `global-setup` — xác nhận không lỗi khi apply cùng foundation.

## Dependencies

- Depends on: EPIC foundation (GĐ1) — `deposit_accounts` + `deposit_movements` migration đã apply (FK targets).
- Blocks: TKT-DFS-02 (entities map các cột này).
