# TKT-SUP-01 Schema: supplier_group entity + provider fields + migration

## Epic

[EPIC-29052026 Supplier & Supplier Group management](../epics/EPIC-29052026-supplier-management.md)

## Layer

🟦 Backend only (DB schema).

## Summary

Foundation cho cả epic. Tạo entity `SupplierGroupEntity` (bảng `provider_groups`, self-referencing hierarchy) và **mở rộng** `ProviderEntity` (`inventory_providers`) bằng đầy đủ cột nhà cung cấp (type tổ chức/cá nhân, nhóm NCC, công nợ, ngân hàng, người liên hệ, CMND, là khách hàng). Viết tay **một** migration. KHÔNG tạo bảng `suppliers` mới — chỉ ADD column nên FK `supplier_debts.supplier_id → inventory_providers(id)` giữ nguyên hiệu lực.

## Deliverables

- `apps/api/src/modules/inventory/location/supplier-group.entity.ts` — `@Entity('provider_groups')` extends `BaseEntity`; `@Unique('uq_provider_group_org_code', ['organizationId','code'])`; cột `code` (varchar 50), `name` (varchar 200), `parentGroupId` (`parent_group_id` uuid nullable) + self `@ManyToOne(() => SupplierGroupEntity, { nullable:true, onDelete:'SET NULL' })` `@JoinColumn({ name:'parent_group_id' })`, `description` (text nullable), `isActive` (`is_active` bool default true); index `idx_provider_group_parent`. Mirror `accounting/coa/account.entity.ts`.
- `apps/api/src/modules/inventory/location/provider.entity.ts` — giữ cột cũ, thêm:
  - `enum ProviderType { ORGANIZATION='organization', INDIVIDUAL='individual' }` (local export).
  - `type` (enum, default `organization`), `address` (text), `groupId` (`group_id` uuid) + `@ManyToOne(() => SupplierGroupEntity, { onDelete:'SET NULL' })`, `maxDebt` (`max_debt` numeric(18,2), TS type `string`), `debtTermDays` (`debt_term_days` int), `bankName`, `bankAccountNumber`, `bankBranch`, `isCustomer` (`is_customer` bool default false).
  - Org-only: `taxCode`, `contactTitle`, `contactName`, `contactEmail`, `contactPhone`, `contactPosition`, `contactAddress` (text).
  - Individual-only: `salutation`, `idCardNumber`, `idCardIssueDate` (`id_card_issue_date` date, TS type `string`), `idCardIssuePlace`.
  - Tất cả cột mới nullable, trừ `type` và `isCustomer` (có default).
- `apps/api/src/database/migrations/1782100000000-AddSupplierGroupsAndProviderFields.ts` (timestamp > `1782000000000`), viết tay theo style `1781500000003-AddSupplierDebts.ts`:
  1. Guarded `CREATE TYPE "inventory_providers_type_enum" AS ENUM ('organization','individual')` (tên enum PHẢI khớp default TypeORM = `<table>_<column>_enum`).
  2. `CREATE TABLE IF NOT EXISTS "provider_groups"` (base cols org/branch/created_at/updated_at/created_by + code/name/parent_group_id/description/is_active); `uq_provider_group_org_code` UNIQUE; self-FK `FK_provider_groups_parent ON DELETE SET NULL`; index `idx_provider_group_parent`.
  3. `ALTER TABLE "inventory_providers" ADD COLUMN IF NOT EXISTS …` cho từng cột mới (type NOT NULL DEFAULT 'organization', is_customer NOT NULL DEFAULT false, còn lại nullable).
  4. `FK_inventory_providers_group` (`group_id → provider_groups(id) ON DELETE SET NULL`, guard bằng `DO $$ … EXCEPTION WHEN duplicate_object`); index `idx_inventory_providers_group`, `idx_inventory_providers_org_type`.
  5. `down()` đảo thứ tự: drop index/FK, `DROP COLUMN IF EXISTS …`, `DROP TABLE provider_groups`, `DROP TYPE`.

## Acceptance Criteria

- [ ] `pnpm migration:run` tạo bảng `provider_groups`, enum `inventory_providers_type_enum`, và mọi cột mới trên `inventory_providers`; `pnpm migration:revert` drop sạch.
- [ ] Provider hiện hữu sau migration có `type='organization'`, `is_customer=false`; dữ liệu cũ nguyên vẹn.
- [ ] FK `supplier_debts.supplier_id → inventory_providers(id)` vẫn còn (không drop/rename cột cũ).
- [ ] `synchronize:false` — sau `migration:run`, `migration:generate` KHÔNG sinh drift cho 2 entity (đặc biệt enum type name phải khớp).
- [ ] Self-FK `provider_groups.parent_group_id` và `inventory_providers.group_id` đều `ON DELETE SET NULL`.

## Definition of Done

- [ ] PR gồm 2 entity + 1 migration; `pnpm --filter @erp/api build` pass.
- [ ] Migration up/down chạy local sạch (kiểm tra qua Adminer :18088).
- [ ] Source tiếng Anh (comment/log/column comment).

## Tech Approach

- Hierarchy mirror `AccountEntity` (`parentAccountId` + self `@ManyToOne` + `@JoinColumn`).
- `numeric(18,2)` trả về string từ pg → khai báo `maxDebt: string` trong entity (giống `supplier_debts.original_amount`).
- `ON DELETE SET NULL` ở cả 2 self/FK để không vỡ khi xoá nhóm cha hoặc provider (deletionPolicy HARD).

## Dependencies

- Requires: bảng `inventory_providers` (đã tồn tại).
- Blocks: TKT-SUP-02, TKT-SUP-03.
