# TKT-GIP-01 Seed goods-issue purpose permissions + role grants

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

Add two permission keys that gate the special goods-issue purposes and grant them to the
management roles. The `PermissionSyncService` inserts new catalogue keys on application
bootstrap, so no migration is needed — only the seed arrays change.

## Deliverables

- `apps/api/src/modules/rbac/permissions.seed.ts` — add, after the existing
  `inventory.goods-issue.*` block, `{ key: 'inventory.goods-issue.other-issue', module: 'inventory' }`
  and `{ key: 'inventory.goods-issue.disposal', module: 'inventory' }` (with English descriptions).
- `apps/api/src/database/seeds/org-role-permissions.ts` — grant both keys to SYSTEM_ADMIN,
  GENERAL_MANAGER and BRANCH_MANAGER (the roles that already receive the full `inventory.*` set).
  STAFF stays without.

## Acceptance Criteria

- [x] On a fresh boot the two keys exist in `permissions` (via `PermissionSyncService`).
- [x] SYSTEM_ADMIN / GENERAL_MANAGER / BRANCH_MANAGER default grants include both keys; STAFF does not.
- [x] No migration file added; `synchronize` stays false.

## Definition of Done

- [x] `pnpm --filter @erp/api test` + `lint` green.
- [x] No Vietnamese in backend source.
- [x] Confirm whether the org-role grant path back-fills **existing** orgs
  (`seeds/sync-admin-permissions.seed.ts`); if not, note in the PR that admins assign the
  keys via the RBAC UI.

## Tech Approach

```ts
// permissions.seed.ts (append to the inventory block)
{ key: 'inventory.goods-issue.other-issue', module: 'inventory',
  description: 'Create goods issues with the OTHER purpose' },
{ key: 'inventory.goods-issue.disposal', module: 'inventory',
  description: 'Create goods issues with the DISPOSAL purpose' },
```

## Testing Strategy

- Assert `PERMISSION_SEEDS` contains both keys; assert the role-grant map includes them for the
  three management roles and excludes them for STAFF.

## Dependencies

- Blocks: TKT-GIP-02 (enforcement references these keys), TKT-GIP-03 (FE filters on them).
