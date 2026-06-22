# TKT-CPP-05 BE: fix employee type returning nothing (uuid/varchar join cast)

## Epic

[EPIC-21062026 Counterparty picker redesign](../epics/EPIC-21062026-counterparty-picker-redesign.md)

## Summary

Bug: `POST /v2/counterparties/search` with `type=employee` returned no rows. Root cause — `SearchCounterpartiesHandler.searchEmployees` joined `employee_profiles` using camelCase property names in a raw join string and compared the **varchar** `employee_profiles.organization_id` to the **uuid** `users.organization_id` without a cast. TypeORM does not translate `alias.property` inside a raw join-ON with a cast, so the generated SQL was invalid / matched nothing. Fixed by mirroring the proven `/v2/employees/search` handler: raw snake_case columns + `::uuid` cast.

## Deliverables

- `apps/api/src/modules/counterparty/queries/search-counterparties.handler.ts` — `searchEmployees` join changed to:
  `'ep.user_id = u.id AND ep.organization_id::uuid = u.organization_id'` (dropped the redundant `:orgId` join param; org scope stays on `u.organizationId`).

## Acceptance Criteria

- [ ] `POST /v2/counterparties/search` `{type:"employee"}` returns active users in the org (with `code`/`phone` from `employee_profiles` when present).
- [ ] `type=all` still merges suppliers + customers + employees.
- [ ] Org scoping intact (only `actor.organizationId`).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` (handler spec) green.
- [ ] Live check against the running API: employees load in the Đối tượng picker (Nhân viên + Tất cả). *(Needs the dev API + a seeded org; can't run from CI/local without infra.)*
- [ ] No Vietnamese in backend source.

## Tech Approach

Matches `apps/api/src/modules/admin-search/queries/search-employees-v2.handler.ts` (lines 30-38): the documented `[[reference_branchid_varchar_and_typeorm_cast]]` gotcha — `users.organization_id` (uuid) vs `employee_profiles.organization_id` (varchar via BaseEntity).

## Dependencies

- Depends on: TKT-CPP-01 (the endpoint).
- Blocks: none.
