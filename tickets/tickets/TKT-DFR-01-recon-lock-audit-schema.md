# TKT-DFR-01 Reconcile / Period-lock / Audit schema (migration)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

Hand-written TypeORM migration tạo 3 bảng nền cho GĐ3: `deposit_recon_batch` (lô đối chiếu sao kê — FR-09), `deposit_period_lock` (khóa sổ theo kỳ với snapshot số dư cuối kỳ — FR-12/BR-LOCK-03), `deposit_audit_log` (audit bất biến — NFR-05). Các cột đối chiếu/phí/value-date (`recon_status`, `recon_batch_id`, `reconciled_by/at`, `fee_amount`, `net_amount`, `value_date`) **đã có sẵn trên `deposit_movements` từ GĐ1 `TKT-DF-01`** — ticket này **tham chiếu, KHÔNG re-add**; nó chỉ thêm FK `deposit_recon_batch.id ← deposit_movements.recon_batch_id` (nếu GĐ1 để cột chưa gắn FK) và index phục vụ đối chiếu.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-DepositReconLockAudit.ts` — migration hand-written (up/down), `synchronize` giữ false. Tạo:
  - **`deposit_recon_batch`**: `id uuid PK`, `organization_id uuid NOT NULL`, `branch_id uuid NOT NULL`, `deposit_account_id uuid NOT NULL` (FK → `deposit_accounts`), `batch_number varchar` (số DS), `stmt_from_date date NOT NULL`, `stmt_to_date date NOT NULL`, `stmt_total_amount numeric(18,2) NOT NULL`, `system_total_amount numeric(18,2) NOT NULL`, `diff_amount numeric(18,2) NOT NULL`, `status deposit_recon_batch_status NOT NULL` (`RECONCILED` | `DISCREPANCY`), `note text NULL`, `reconciled_by uuid NULL`, `reconciled_at timestamptz NULL`, `created_at`/`updated_at`/`deleted_at`. Index `(organization_id, branch_id, deposit_account_id)`; unique `(organization_id, batch_number)`.
  - **`deposit_period_lock`**: `id uuid PK`, `organization_id uuid NOT NULL`, `branch_id uuid NOT NULL`, `period varchar(7) NOT NULL` (YYYY-MM), `status deposit_period_lock_status NOT NULL DEFAULT 'LOCKED'` (`LOCKED` | `UNLOCKED`), `closing_balance_snapshot jsonb NOT NULL` (mảng `{ depositAccountId, closingBalance, bookBalance, availableBalance }` per account — BR-LOCK-03), `locked_by uuid NOT NULL`, `locked_at timestamptz NOT NULL`, `unlocked_by uuid NULL`, `unlocked_at timestamptz NULL`, `unlock_reason text NULL`, `created_at`/`updated_at`. **UNIQUE `(organization_id, branch_id, period)`**.
  - **`deposit_audit_log`**: `id uuid PK`, `organization_id uuid NOT NULL`, `branch_id uuid NULL`, `entity_type varchar NOT NULL` (`DEPOSIT_MOVEMENT` | `RECON_BATCH` | `PERIOD_LOCK` | `BANK_RECEIPT` | `BANK_PAYMENT` | `DEPOSIT_ACCOUNT`), `entity_id uuid NOT NULL`, `action varchar NOT NULL` (`RECONCILE` | `UNRECONCILE` | `LOCK_PERIOD` | `UNLOCK_PERIOD` | `REVERSE` | `EDIT_OPENING_BALANCE` | `POS_LATE_LOCKED`), `before jsonb NULL`, `after jsonb NULL`, `actor_id uuid NOT NULL`, `reason text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`. Index `(organization_id, entity_type, entity_id)`, index `(organization_id, created_at)`. **Append-only** (không `updated_at`/`deleted_at`).

## Acceptance Criteria

- [ ] Migration chạy `up` sạch trên DB đã có dữ liệu GĐ1/GĐ2; `down` drop 3 bảng + 3 enum type theo thứ tự ngược (FK-safe).
- [ ] KHÔNG re-add bất kỳ cột nào đã tồn tại trên `deposit_movements` / `deposit_payment_policy` từ GĐ1 (verify bằng cách đọc migration GĐ1 trước — nếu trùng, migration fail idempotency).
- [ ] Tiền dùng `numeric(18,2)` (NFR-06, không float). PK `uuid`. Timestamps UTC (`timestamptz`).
- [ ] `deposit_audit_log` **append-only**: không có cột mutate/soft-delete; các module GĐ3 chỉ INSERT (NFR-05 bất biến).
- [ ] `deposit_period_lock` unique `(organization_id, branch_id, period)` — 1 kỳ/chi nhánh chỉ 1 bản ghi; unlock đổi `status`, không tạo bản ghi mới.
- [ ] `closing_balance_snapshot` là `jsonb` mảng per-account (BR-LOCK-03), làm số dư đầu kỳ kế tiếp.
- [ ] Mọi bảng có `organization_id` (+ `branch_id`) để guard scope (BR-PERM-01, UAT-13); không tạo cross-tenant leak ở tầng schema.
- [ ] FK `deposit_recon_batch(deposit_account_id) → deposit_accounts(id)` `ON DELETE RESTRICT`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] `pnpm migration:run` rồi `pnpm migration:revert` chạy được cả 2 chiều trên DB local.
- [ ] Không đổi `synchronize`; không có thay đổi schema ngoài migration này.
- [ ] Không có tiếng Việt trong backend source (enum/column/identifier English).
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Đọc migration GĐ1 (`...-DepositFoundation*.ts`) trước để xác nhận cột đã có, tránh trùng. Enum tạo qua `queryRunner.query('CREATE TYPE ...')` (hand-written, không dựa `synchronize`).

```ts
export class DepositReconLockAudit1720000000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE deposit_recon_batch_status AS ENUM ('RECONCILED','DISCREPANCY')`);
    await q.query(`CREATE TYPE deposit_period_lock_status AS ENUM ('LOCKED','UNLOCKED')`);

    await q.query(`
      CREATE TABLE deposit_recon_batch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        deposit_account_id uuid NOT NULL REFERENCES deposit_accounts(id) ON DELETE RESTRICT,
        batch_number varchar NOT NULL,
        stmt_from_date date NOT NULL,
        stmt_to_date date NOT NULL,
        stmt_total_amount numeric(18,2) NOT NULL,
        system_total_amount numeric(18,2) NOT NULL,
        diff_amount numeric(18,2) NOT NULL,
        status deposit_recon_batch_status NOT NULL,
        note text,
        reconciled_by uuid,
        reconciled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT uq_deposit_recon_batch_number UNIQUE (organization_id, batch_number)
      )`);
    await q.query(`CREATE INDEX idx_deposit_recon_batch_scope
      ON deposit_recon_batch (organization_id, branch_id, deposit_account_id)`);

    await q.query(`
      CREATE TABLE deposit_period_lock (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        period varchar(7) NOT NULL,
        status deposit_period_lock_status NOT NULL DEFAULT 'LOCKED',
        closing_balance_snapshot jsonb NOT NULL,
        locked_by uuid NOT NULL,
        locked_at timestamptz NOT NULL,
        unlocked_by uuid,
        unlocked_at timestamptz,
        unlock_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_deposit_period_lock UNIQUE (organization_id, branch_id, period)
      )`);

    await q.query(`
      CREATE TABLE deposit_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        branch_id uuid,
        entity_type varchar NOT NULL,
        entity_id uuid NOT NULL,
        action varchar NOT NULL,
        before jsonb,
        after jsonb,
        actor_id uuid NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX idx_deposit_audit_entity
      ON deposit_audit_log (organization_id, entity_type, entity_id)`);
    await q.query(`CREATE INDEX idx_deposit_audit_time
      ON deposit_audit_log (organization_id, created_at)`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS deposit_audit_log`);
    await q.query(`DROP TABLE IF EXISTS deposit_period_lock`);
    await q.query(`DROP TABLE IF EXISTS deposit_recon_batch`);
    await q.query(`DROP TYPE IF EXISTS deposit_period_lock_status`);
    await q.query(`DROP TYPE IF EXISTS deposit_recon_batch_status`);
  }
}
```

**Design note (flag):** `deposit_audit_log` dùng `entity_type` + `entity_id` (generalize `transaction_id` trong shared-context data model) vì NFR-05 audit trải cả movement, voucher, recon batch, period lock, chỉnh số dư đầu kỳ — một cột `transaction_id` không đủ. Entity/service ở DFR-02/05/06 tra theo cặp `(entity_type, entity_id)`.

## Testing Strategy

- Unit: không cần spec riêng cho migration; verify bằng `pnpm migration:run` + `pnpm migration:revert` trên DB local (idempotent 2 chiều). Nếu repo có pattern spec cho migration (grep `migrations` trong `test/`), theo pattern đó.
- Sanity: sau `up`, `\d deposit_recon_batch` / `deposit_period_lock` / `deposit_audit_log` khớp cột; enum values đúng.

## Dependencies

- Depends on: `EPIC-15072026-deposit-fund-foundation` `TKT-DF-01` (đã có `deposit_accounts`, `deposit_movements` + cột recon/fee/value_date).
- Blocks: TKT-DFR-02, TKT-DFR-03, TKT-DFR-04, TKT-DFR-05, TKT-DFR-06.
