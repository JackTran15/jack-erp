# TKT-CTF-01 Schema `cash_transfer` + giá trị enum tiền mặt liên chi nhánh

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Hai migration viết tay + entity cho bảng `cash_transfer` (header chuyển tiền mặt liên chi nhánh) và các giá trị enum mà chân chi/chân thu cần. Tách 2 file vì Postgres không cho dùng giá trị enum vừa `ADD VALUE` trong cùng transaction — đúng lý do đã ghi ở `1787200000000-AddFundSwapReferenceType.ts`.

## Deliverables

- `apps/api/src/database/migrations/1787300000000-AddCashTransferEnumValues.ts` (mới) — chỉ `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
- `apps/api/src/database/migrations/1787300000001-CashTransfer.ts` (mới) — `CREATE TYPE cash_transfer_fund_kind` + `CREATE TABLE cash_transfer` + index.
- `apps/api/src/modules/accounting/cash-vouchers/enums.ts` — thêm giá trị vào 4 enum + enum mới `CashTransferFundKind`.
- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/cash-transfer.entity.ts` (mới).

## Acceptance Criteria

- [ ] `CashPaymentPurpose` có thêm `DEPOSIT_TRANSFER` và `INTER_BRANCH_OUT`; `CashReceiptPurpose` có thêm `INTER_BRANCH_IN`; `CashPaymentReferenceType` và `CashReceiptReferenceType` đều có thêm `TRANSFER`.
- [ ] Migration enum **không** tạo bảng và **không** dùng giá trị vừa thêm — chỉ `ADD VALUE IF NOT EXISTS`, `down()` là no-op có comment (Postgres không xoá được một giá trị enum an toàn).
- [ ] `cash_transfer` khai báo cột tay, **không** extends `BaseEntity` — có 2 branch scope (`from_branch_id`/`to_branch_id`), không phải một.
- [ ] Cột `status` dùng lại PG type `deposit_transfer_status` đã tồn tại (`enumName: 'deposit_transfer_status'`) và TS enum `DepositTransferStatus` từ `@erp/shared-interfaces` — không tạo type/enum trùng lặp.
- [ ] CHECK constraint bảo đảm đúng một trong `to_cash_account_id` / `to_deposit_account_id` khác NULL và khớp `to_fund_kind`.
- [ ] `id` mặc định `uuid_generate_v4()` (không phải `gen_random_uuid()` — pgcrypto không bật trong DB này).
- [ ] `pnpm migration:run` chạy sạch trên DB đang có dữ liệu; `pnpm migration:revert` hai lần trả về trạng thái cũ (trừ giá trị enum, cố ý để lại).
- [ ] Không đụng `cash_movements` — không thêm cột `transfer_pair_id`/`transfer_status`; trạng thái sống ở bảng `cash_transfer`.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` pass.
- [ ] `pnpm migration:run` + `pnpm migration:show` xác nhận cả 2 migration đã áp dụng.
- [ ] Kiểm bằng SQL: `SELECT unnest(enum_range(NULL::cash_payment_purpose_enum))` có `DEPOSIT_TRANSFER`, `INTER_BRANCH_OUT`.
- [ ] Không dùng `migration:generate` (sinh drift khổng lồ trong repo này) — viết tay.
- [ ] Không có tiếng Việt trong source backend (comment/lỗi/log).

## Tech Approach

```ts
// 1787300000000-AddCashTransferEnumValues.ts
// Must stay in its own migration — Postgres cannot use an enum value added in
// the same transaction, and migrationsTransactionMode: 'each' commits this file
// before 1787300000001 or any runtime code writes the new values.
await q.query(`ALTER TYPE "cash_payment_purpose_enum" ADD VALUE IF NOT EXISTS 'DEPOSIT_TRANSFER'`);
await q.query(`ALTER TYPE "cash_payment_purpose_enum" ADD VALUE IF NOT EXISTS 'INTER_BRANCH_OUT'`);
await q.query(`ALTER TYPE "cash_receipt_purpose_enum" ADD VALUE IF NOT EXISTS 'INTER_BRANCH_IN'`);
await q.query(`ALTER TYPE "cash_payment_reference_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER'`);
await q.query(`ALTER TYPE "cash_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER'`);
```

```sql
-- 1787300000001-CashTransfer.ts
CREATE TYPE "cash_transfer_fund_kind" AS ENUM ('CASH', 'DEPOSIT');

CREATE TABLE "cash_transfer" (
  "id"                     uuid NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id"        varchar NOT NULL,
  "from_branch_id"         varchar NOT NULL,
  "to_branch_id"           varchar NOT NULL,
  "from_cash_account_id"   uuid NOT NULL,
  "to_fund_kind"           "cash_transfer_fund_kind" NOT NULL,
  "to_cash_account_id"     uuid NULL,
  "to_deposit_account_id"  uuid NULL,
  "amount"                 numeric(18,2) NOT NULL,
  "status"                 "deposit_transfer_status" NOT NULL DEFAULT 'DANG_CHUYEN',
  "from_payment_id"        uuid NOT NULL,
  "to_receipt_id"          uuid NULL,
  "transfer_pair_id"       uuid NOT NULL,
  "initiated_by"           varchar NOT NULL,
  "initiated_at"           timestamptz NOT NULL,
  "confirmed_by"           varchar NULL,
  "confirmed_at"           timestamptz NULL,
  "cancelled_by"           varchar NULL,
  "cancelled_at"           timestamptz NULL,
  "cancel_reason"          text NULL,
  "note"                   text NULL,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now(),
  "deleted_at"             timestamptz NULL,
  CONSTRAINT "PK_cash_transfer" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_cash_transfer_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "CHK_cash_transfer_destination" CHECK (
    ("to_fund_kind" = 'CASH'
       AND "to_cash_account_id" IS NOT NULL AND "to_deposit_account_id" IS NULL)
    OR
    ("to_fund_kind" = 'DEPOSIT'
       AND "to_deposit_account_id" IS NOT NULL AND "to_cash_account_id" IS NULL)
  ),
  CONSTRAINT "FK_cash_transfer_from_cash_account"
    FOREIGN KEY ("from_cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
  CONSTRAINT "FK_cash_transfer_to_cash_account"
    FOREIGN KEY ("to_cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
  CONSTRAINT "FK_cash_transfer_to_deposit_account"
    FOREIGN KEY ("to_deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
  CONSTRAINT "FK_cash_transfer_from_payment"
    FOREIGN KEY ("from_payment_id") REFERENCES "cash_payments"("id") ON DELETE RESTRICT
);
```

`to_receipt_id` cố ý **không** có FK: đích có thể là `cash_receipts` hoặc `bank_receipts` tuỳ `to_fund_kind`, Postgres không có FK đa bảng.

Index: `(organization_id, status)`, `from_branch_id`, `to_branch_id`, `created_at`.

```ts
// cash-transfer.entity.ts — columns declared explicitly (not extending
// BaseEntity) because there are two branch scopes (from/to), not one. Reuses
// the deposit_transfer_status Postgres type and DepositTransferStatus enum:
// the lifecycle vocabulary is identical, deliberately not duplicated.
@Entity('cash_transfer')
export class CashTransferEntity {
  @Column({ name: 'to_fund_kind', type: 'enum', enum: CashTransferFundKind,
            enumName: 'cash_transfer_fund_kind' })
  toFundKind: CashTransferFundKind;

  @Column({ type: 'enum', enum: DepositTransferStatus,
            enumName: 'deposit_transfer_status',
            default: DepositTransferStatus.DANG_CHUYEN })
  status: DepositTransferStatus;
  // ...
}
```

## Testing Strategy

Không có unit test riêng (schema-only). Xác minh bằng `pnpm migration:run` + query Adminer (`:18088`) đúng checklist ở Acceptance Criteria. Test hành vi nằm ở [TKT-CTF-08](./TKT-CTF-08-tests.md).

## Dependencies

- Depends on: —
- Blocks: [TKT-CTF-02](./TKT-CTF-02-cash-transfer-service.md)
