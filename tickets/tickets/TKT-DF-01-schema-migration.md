# TKT-DF-01 Schema migration — banks / deposit_accounts / deposit_movements / deposit_payment_policy

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Migration **viết tay** tạo 4 bảng nền tảng của quỹ tiền gửi cùng các enum type và index. Đây là ticket gốc
của cả epic — mọi ticket khác depend on schema này. Mirror cấu trúc `cash_accounts` / `cash_movements`
(EPIC-009 + EPIC-18052026) và bổ sung cột đặc thù tiền gửi: recon (`recon_status`/`recon_batch_id`/…),
phí (`fee_amount`/`net_amount` — decision 3, logic GĐ3), và `value_date` (D5). Điểm tài chính trọng yếu:
UNIQUE `(source, source_ref_id, source_ref_line_id)` trên `deposit_movements` để chặn double-post ở **tầng
DB** (D2 / R3 / BR-POS-01) ở **grain dòng thanh toán** (finer hơn cash — cash chỉ key invoice-grain), và index
NFR-01 cho Sổ chi tiết. `deposit_accounts.branch_id NOT NULL` (một tài khoản = một chi nhánh, OQ-03 đã chốt),
đúng một `is_default` mỗi chi nhánh, `balance` real-time (BR-CHI-01 negative guard reuse), `allow_negative`.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-DepositFundFoundation.ts` — migration viết tay (raw SQL
  qua `queryRunner.query`), `up()` tạo enum + 4 bảng + index, `down()` drop ngược thứ tự (FK-safe).
  Mirror style migration cash (`apps/api/src/database/migrations/*CashMovement*.ts` / `*CashVoucher*.ts`).

**Enum types (Postgres `CREATE TYPE`):**
- `deposit_account_type_enum` = `BANK_ACCOUNT | EWALLET | POS_MERCHANT`
- `deposit_account_status_enum` = `ACTIVE | INACTIVE`
- `deposit_movement_type_enum` = `DEPOSIT | WITHDRAWAL | TRANSFER | ADJUSTMENT`
- `deposit_movement_source_enum` = `POS_INVOICE | MANUAL | TRANSFER | SYSTEM`
- `deposit_recon_status_enum` = `CHUA | DA | LECH` (default `CHUA`)
- `deposit_transfer_status_enum` = `DANG_CHUYEN | HOAN_TAT`
- `fee_bearer_enum` = `MERCHANT | CUSTOMER`

> **Không** tạo `target_fund_enum`: `target_fund` giờ là giá trị **suy ra** (DERIVED) từ COA — một dòng thanh toán phi tiền mặt chảy vào quỹ DEPOSIT **khi và chỉ khi** COA đã resolve trên `invoice_payments.account_id` khớp `deposit_accounts.account_id` ACTIVE cùng org+branch — nên không có cột/enum `target_fund` nào được lưu (xem DF-04).

**Tables (UUID PK `uuid_generate_v4()`; money `numeric(18,2)`; `created_at`/`updated_at timestamptz default now()`):**

`banks` (danh mục ngân hàng, scope org, soft-delete):
- `id`, `organization_id NOT NULL`, `code varchar NOT NULL`, `name varchar NOT NULL`, `short_name varchar NULL`,
  `is_active bool NOT NULL default true`, `deleted_at timestamptz NULL`.
- UNIQUE `(organization_id, code) WHERE deleted_at IS NULL`.

`deposit_accounts` (mirror `cash_accounts`, soft-delete):
- `id`, `organization_id NOT NULL`, `branch_id NOT NULL`, `name varchar NOT NULL`, `code varchar NOT NULL`,
  `account_no varchar NOT NULL`, `account_name varchar NOT NULL`, `bank_id uuid NOT NULL` (FK `banks`),
  `bank_branch varchar NULL`, `type deposit_account_type_enum NOT NULL`, `mid varchar NULL`, `tid varchar NULL`,
  `account_id uuid NOT NULL` (COA 112x — FK `accounts`), `opening_balance numeric(18,2) NOT NULL default 0`,
  `opening_date date NOT NULL`, `balance numeric(18,2) NOT NULL default 0` (real-time),
  `allow_negative bool NOT NULL default false`, `is_default bool NOT NULL default false`,
  `status deposit_account_status_enum NOT NULL default 'ACTIVE'`, `deleted_at timestamptz NULL`.
- UNIQUE `(organization_id, code) WHERE deleted_at IS NULL`.
- **Partial UNIQUE** đúng 1 mặc định / chi nhánh: `uniq_deposit_accounts_default ON deposit_accounts(branch_id) WHERE is_default = true AND deleted_at IS NULL` (BR-ACC-03).

`deposit_movements` (mirror `cash_movements` + recon/fee/value_date; **append-only, KHÔNG soft-delete**):
- `id`, `organization_id NOT NULL`, `branch_id NOT NULL`, `deposit_account_id uuid NOT NULL` (FK),
  `to_account_id uuid NULL` (FK `deposit_accounts`, dest của TRANSFER), `type deposit_movement_type_enum NOT NULL`,
  `amount numeric(18,2) NOT NULL`, `fee_amount numeric(18,2) NOT NULL default 0`,
  `net_amount numeric(18,2) NOT NULL` (GĐ1 = amount; logic GĐ3), `doc_date date NOT NULL`,
  `value_date date NULL`, `recon_status deposit_recon_status_enum NOT NULL default 'CHUA'`,
  `recon_batch_id uuid NULL`, `reconciled_by uuid NULL`, `reconciled_at timestamptz NULL`,
  `source deposit_movement_source_enum NOT NULL`, `source_ref_id uuid NULL`, `source_ref_line_id uuid NULL`,
  `journal_entry_id uuid NULL` (FK `journal_entries`), `transfer_pair_id uuid NULL`,
  `transfer_status deposit_transfer_status_enum NULL`, `document_number varchar NULL` (NTTK/UNC khi có voucher).
- **UNIQUE** `uniq_deposit_movements_source_ref ON deposit_movements(source, source_ref_id, source_ref_line_id)` —
  D2 idempotency payment-line grain. (Postgres mặc định NULLS DISTINCT → MANUAL/adjustment với ref NULL không đụng nhau; POS carry `source_ref_id=invoiceId`, `source_ref_line_id=invoicePaymentId` → dedupe đúng.)
- **Index NFR-01**: `idx_deposit_movements_ledger ON deposit_movements(organization_id, branch_id, deposit_account_id, doc_date, id)`.
- Index phụ cho ledger nhận-về: `idx_deposit_movements_to_account ON deposit_movements(to_account_id, doc_date) WHERE to_account_id IS NOT NULL`.

`deposit_payment_policy` (FR-02 — bảng **mỏng** chỉ chứa phần đặc thù tiền gửi; **KHÔNG** map lại `payment_method → account` vì `payment_accounts` đã làm việc đó — scope org + branch-nullable **mirror `payment_accounts`**, soft-delete):
- `id`, `organization_id NOT NULL`, `branch_id uuid NULL` (NULL = policy org-wide mặc định; branch cụ thể override — mirror scoping của `payment_accounts`),
  `payment_method varchar NOT NULL` (match key mirror `InvoicePaymentMethod`: `cash|bank_transfer|card`),
  `card_type varchar NULL` (khóa tinh hơn — **`invoice_payments` chưa có cột `cardType`** nên GĐ1 luôn NULL; bắt `card_type` tại checkout là việc GĐ3),
  `deposit_account_id uuid NULL` (FK `deposit_accounts` — chỉ dùng khi COA-join **nhập nhằng** (1 COA ↔ nhiều quỹ ACTIVE); NULL = suy ra quỹ theo COA),
  `fee_rate numeric(9,4) NOT NULL default 0`, `fee_bearer fee_bearer_enum NULL`, `settlement_days int NOT NULL default 0`,
  `effective_from date NOT NULL default now()`, `effective_to date NULL` (BR-MAP-02 non-retroactive),
  `is_active bool NOT NULL default true`, `created_at`/`updated_at timestamptz default now()`, `created_by uuid NULL`, `deleted_at timestamptz NULL`.
- Index: `idx_deposit_payment_policy_lookup ON deposit_payment_policy(organization_id, branch_id, payment_method)`.

> **Reuse `payment_accounts` (không dựng lại):** bảng `payment_accounts`
> (`apps/api/src/modules/accounting/payment-accounts/payment-account.entity.ts`) **đã** map `payment_method → account_id (COA 112x)` + nhãn ngân hàng, org-wide (`branch_id NULL`) hoặc branch override, và checkout **đã** resolve COA đó rồi lưu vào `invoice_payments.account_id`. `deposit_payment_policy` chỉ bổ sung phần **kinh tế tiền gửi** (fee/settlement/effective + optional override quỹ khi COA nhập nhằng), không lặp lại vai trò method→account.

**Verify (không tạo mới):** `DocumentType.BANK_RECEIPT (NTTK)` / `BANK_PAYMENT (UNC)` / `RECONCILIATION (DS)` **đã tồn tại** trong
`packages/shared-interfaces/src/document-numbering` + `DEFAULT_DOC_NUMBER_CONFIG` — chỉ verify, **không extend**.

## Acceptance Criteria

- [ ] 4 bảng + 7 enum type tạo đúng; `synchronize` giữ **false**; PK là UUID, tiền `numeric(18,2)` (NFR-06, **không float**). Không tạo `target_fund_enum` (target_fund suy ra theo COA, không lưu).
- [ ] `deposit_accounts.branch_id` là `NOT NULL` (OQ-03 chốt); partial UNIQUE ép **đúng 1** `is_default`/chi nhánh (BR-ACC-03).
- [ ] `deposit_movements` có UNIQUE `(source, source_ref_id, source_ref_line_id)` — insert lại cùng bộ khóa với `source_ref_id`/`line_id` không NULL → **unique violation** (D2 / R3 / BR-POS-01).
- [ ] Index NFR-01 `(organization_id, branch_id, deposit_account_id, doc_date, id)` tồn tại (query plan dùng được cho Sổ chi tiết).
- [ ] Cột `fee_amount` (default 0), `net_amount`, `value_date` (nullable) có mặt ngay từ GĐ1 (decision 3 / D4 / D5) dù logic phí ở GĐ3.
- [ ] `allow_negative bool default false` trên `deposit_accounts` (nền cho BR-CHI-01 negative guard reuse).
- [ ] `deposit_payment_policy` có `effective_from`/`effective_to` (nền BR-MAP-02 non-retroactive) + `deposit_account_id` nullable (override quỹ chỉ khi COA nhập nhằng) + `fee_rate`/`fee_bearer`/`settlement_days`; **không** có cột `payment_method → account` (đó là việc của `payment_accounts`).
- [ ] FK: `deposit_accounts.bank_id → banks`, `.account_id → accounts`; `deposit_movements.deposit_account_id/to_account_id → deposit_accounts`, `.journal_entry_id → journal_entries`.
- [ ] `up()` chạy sạch trên DB rỗng; `down()` drop bảng (thứ tự FK-safe) + drop 7 enum → schema về nguyên trạng.
- [ ] `DocumentType.BANK_RECEIPT/BANK_PAYMENT/RECONCILIATION` đã tồn tại (ghi chú verify trong PR — không extend).

## Definition of Done

- [ ] `pnpm migration:run` rồi `pnpm migration:revert` đều xanh; `pnpm migration:show` báo đã apply/revert đúng.
- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Không đổi schema ngoài migration này; `synchronize` giữ false.
- [ ] Không có tiếng Việt trong backend source (SQL/comment/identifier English).
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Migration viết tay (ref.md D2/D4/D5/D6; memory: `migration:generate` sinh drift lớn → trích `CREATE` viết tay).
`migrationsTransactionMode='each'` — tạo `CREATE TYPE` rồi dùng ngay trong `CREATE TABLE` cùng migration là an toàn
(type mới, không phải `ALTER TYPE ADD VALUE` → không dính 55P04).

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class DepositFundFoundation1752600000000 implements MigrationInterface {
  name = 'DepositFundFoundation1752600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE deposit_account_type_enum AS ENUM ('BANK_ACCOUNT','EWALLET','POS_MERCHANT')`);
    await q.query(`CREATE TYPE deposit_movement_type_enum AS ENUM ('DEPOSIT','WITHDRAWAL','TRANSFER','ADJUSTMENT')`);
    await q.query(`CREATE TYPE deposit_movement_source_enum AS ENUM ('POS_INVOICE','MANUAL','TRANSFER','SYSTEM')`);
    await q.query(`CREATE TYPE deposit_recon_status_enum AS ENUM ('CHUA','DA','LECH')`);
    // ... deposit_account_status_enum, deposit_transfer_status_enum, fee_bearer_enum

    await q.query(`CREATE TABLE banks ( ... )`);
    await q.query(`CREATE TABLE deposit_accounts ( ... branch_id uuid NOT NULL, ... )`);
    await q.query(`CREATE TABLE deposit_movements ( ... )`);
    await q.query(`CREATE TABLE deposit_payment_policy ( ... )`);

    await q.query(`CREATE UNIQUE INDEX uniq_deposit_accounts_default
      ON deposit_accounts(branch_id) WHERE is_default = true AND deleted_at IS NULL`);
    await q.query(`CREATE UNIQUE INDEX uniq_deposit_movements_source_ref
      ON deposit_movements(source, source_ref_id, source_ref_line_id)`);
    await q.query(`CREATE INDEX idx_deposit_movements_ledger
      ON deposit_movements(organization_id, branch_id, deposit_account_id, doc_date, id)`);
    // ... idx_deposit_movements_to_account, idx_deposit_payment_policy_lookup, unique code/org indexes
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE deposit_payment_policy`);
    await q.query(`DROP TABLE deposit_movements`);
    await q.query(`DROP TABLE deposit_accounts`);
    await q.query(`DROP TABLE banks`);
    // DROP TYPE ... (7 enums)
  }
}
```

Entity classes + TypeORM decorators land in **TKT-DF-03** — ticket này chỉ DDL. Timestamp filename theo convention
`<epoch-ms>-DepositFundFoundation.ts` (`data-source.ts` = `apps/api/src/database/data-source.ts`).

## Testing Strategy

- **Migration round-trip** (thủ công + CI gate): `migration:run` → assert 4 bảng + 7 enum + các index/unique tồn tại
  (`\d+ deposit_movements` qua Adminer :18088 hoặc `information_schema`) → `migration:revert` → assert đã drop hết.
- **Unique index guard**: insert 2 row `deposit_movements` cùng `(POS_INVOICE, invId, lineId)` → row thứ 2 fail
  `duplicate key` (nền UAT-03). Verify chính thức qua E2E ở **TKT-DF-11**.
- Không có unit spec riêng cho DDL; schema được E2E của DF-11 (erp_test) load qua `global-setup` (chạy migrations).

## Dependencies

- Depends on: — (ticket gốc của epic).
- Blocks: TKT-DF-02 (enums TS mirror DDL), và gián tiếp toàn bộ epic.
