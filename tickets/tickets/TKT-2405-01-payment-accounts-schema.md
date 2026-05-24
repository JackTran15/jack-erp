# TKT-2405-01 Payment accounts & default-account schema

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟦 Backend only (DB schema).

## Summary

Tạo 2 bảng cấu hình nền cho cả epic:
- `payment_accounts` — map payment method (`cash`/`bank_transfer`/`card`) → một COA account, scope theo org+branch, có cột ngân hàng **có cấu trúc** (`bank_name`, `bank_code`, `account_number`) để hiển thị "Tài khoản thu" như mockup `4242... - ABB - Ngân hàng TMCP An Bình`.
- `accounting_default_account` — default account theo `account_role` (ship sẵn `REVENUE` + `RECEIVABLE`), có override theo branch (branch NULL = mặc định org).

Migration viết tay + 2 entity + module skeleton.

## Deliverables

- Migration `apps/api/src/database/migrations/1781300000000-PaymentAccountsAndDefaultAccounts.ts` (timestamp > `1781200000000`): `CREATE TYPE payment_account_method_enum` + `accounting_default_account_role_enum`; `CREATE TABLE payment_accounts` + `accounting_default_account`; partial unique indexes; FK `account_id → accounts(id) ON DELETE RESTRICT`. `down()` drop tables rồi types.
- `apps/api/src/modules/accounting/payment-accounts/payment-account.entity.ts` — extends `BaseEntity`, override `branch_id` → `nullable:false`, `@DeleteDateColumn`, enum + bank cols + `label` + `is_active` + `sort_order`.
- `.../payment-accounts/accounting-default-account.entity.ts` — extends `BaseEntity` (branchId nullable giữ nguyên).
- `.../payment-accounts/enums.ts` — `PaymentAccountMethod` (string values khớp `InvoicePaymentMethod`: `cash`/`bank_transfer`/`card`) + `AccountingDefaultAccountRole` (`REVENUE`/`RECEIVABLE`).
- `.../payment-accounts/payment-accounts.module.ts` — `TypeOrmModule.forFeature([PaymentAccountEntity, AccountingDefaultAccountEntity])` (skeleton, providers thêm ở TKT-2405-02/03); wire vào `accounting.module.ts` imports + exports.

## Acceptance Criteria

- [ ] `pnpm migration:run` tạo đủ 2 bảng + 2 enum type; `pnpm migration:revert` drop sạch.
- [ ] `payment_accounts.branch_id` **NOT NULL**; partial unique `(organization_id, branch_id, payment_method, account_id) WHERE deleted_at IS NULL`.
- [ ] `accounting_default_account` có **2** partial unique index: `(org, account_role) WHERE branch_id IS NULL` và `(org, branch_id, account_role) WHERE branch_id IS NOT NULL` (vì Postgres coi NULL là distinct).
- [ ] FK `account_id → accounts(id) ON DELETE RESTRICT` ở cả 2 bảng.
- [ ] `synchronize:false` — sau `migration:run`, `migration:show`/generate không sinh drift cho 2 entity mới.

## Definition of Done

- [ ] PR gồm migration + 2 entity + module skeleton; `pnpm build` pass.
- [ ] Migration up/down chạy local sạch.
- [ ] Source tiếng Anh (comment/log).

## Tech Approach

- Raw SQL qua `queryRunner.query()` theo style `1781000000000-CashVouchersPhase1.ts` — `uuid NOT NULL DEFAULT uuid_generate_v4()`, `varchar` cho org/branch id, `TIMESTAMP` audit cols, đặt tên `PK_`/`UQ_`/`FK_`.
- **Ship cả 2 enum value `REVENUE`/`RECEIVABLE` ngay** để Phase sau không phải `ALTER TYPE ADD VALUE` (không revert được trong transaction — đúng bài học migration cash-vouchers).
- `branch_id NOT NULL` ở `payment_accounts` là chủ ý (luôn branch-scoped) → entity override `@Column({ name:'branch_id', nullable:false })`.

## Dependencies

- Requires: bảng `accounts` (COA, EPIC-009) đã tồn tại.
- Blocks: TKT-2405-02, TKT-2405-03, TKT-2405-05.
