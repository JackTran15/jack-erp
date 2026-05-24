# TKT-2405-03 Default revenue resolver & default-account config API

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟦 Backend only.

## Summary

`DefaultAccountResolverService` resolve `revenueAccountId` từ `accounting_default_account` (branch override → org default → throw), cộng endpoint đọc/upsert để cấu hình tài khoản mặc định. Generic theo `account_role` để sau này `RECEIVABLE` / exchange / return dùng lại được.

## Deliverables

- `default-account-resolver.service.ts`:
  - `resolve(role, organizationId, branchId?)` — **1 query**: `WHERE org AND account_role AND (branch_id = $b OR branch_id IS NULL) AND deleted_at IS NULL ORDER BY branch_id NULLS LAST LIMIT 1` (row theo branch thắng, fallback org).
  - `resolveRevenueAccountId(organizationId, branchId?)` — wrapper gọi `resolve(REVENUE, ...)`.
  - Không có row → `BadRequestException("No revenue account configured for branch <id>. Configure a default revenue account before checkout.")` — **tuyệt đối không** fallback account hardcode.
- API config (thêm route vào `payment-account.controller.ts` hoặc controller riêng):
  - `GET /payment-accounts/default-accounts?role=&branchId=` (perm `accounting.default_account.read`).
  - `PUT /payment-accounts/default-accounts` upsert (perm `accounting.default_account.manage`).
- `dto/upsert-default-account.dto.ts`.
- Thêm `DefaultAccountResolverService` vào providers + exports của `payment-accounts.module.ts`.

## Acceptance Criteria

- [ ] Có row branch override → trả account của branch; chỉ có row org (branch NULL) → trả org; không có gì → 400 message chỉ rõ branch + cách khắc phục.
- [ ] `PUT` upsert tôn trọng 2 partial unique (org+role branch-null, org+branch+role branch-set) — update nếu đã có, insert nếu chưa.
- [ ] Không có nhánh fallback hardcode.

## Definition of Done

- [ ] PR resolver + endpoint + DTO; build pass.
- [ ] Unit test `default-account-resolver.service.spec.ts`: 3 nhánh (branch / org / none→400) + upsert.

## Tech Approach

- Một query với `NULLS LAST` thay vì 2 lần round-trip.
- Service generic (`resolve(role,...)`) để exchange/return/receivable adopt sau mà không thêm hạ tầng.

## Dependencies

- Requires: TKT-2405-01.
- Blocks: TKT-2405-04.
