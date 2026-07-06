# TKT-GIP-02 Enforce purpose permission in the create path

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

The `PermissionGuard` reads one static `@RequirePermission` key per handler and runs before the
body is bound, so it cannot vary by `dto.purpose`. Add a body-based check: when the requested
purpose is `OTHER` or `DISPOSAL`, require the matching key seeded in TKT-GIP-01; otherwise
(TRANSFER_OUT, SALE, default) do nothing. This is server-side defense-in-depth behind the FE
filter (TKT-GIP-03). Mirrors the dynamic `RbacService.hasPermission` precedent in
`reporting/reporting.service.ts`.

## Deliverables

- A small shared helper `assertPurposePermission(rbac, actor, purpose)` (e.g. in
  `modules/inventory/goods-issue/`), throwing `ForbiddenException` when the purpose-specific
  key is missing.
- `apps/api/src/modules/inventory/goods-issue/commands/create-goods-issue-v2.handler.ts` —
  inject `RbacService`; call the helper before `goodsIssueService.create()`.
- `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts` (or the legacy
  controller) — call the same helper so the legacy REST create path is covered too.
- `RbacModule` / provider wiring so `RbacService` is injectable in the goods-issue module (it is
  already used elsewhere; import the module or export as needed).

## Acceptance Criteria

- [x] `purpose = DISPOSAL` without `inventory.goods-issue.disposal` → 403; with it → created.
- [x] `purpose = OTHER` without `inventory.goods-issue.other-issue` → 403; with it → created.
- [x] `purpose = TRANSFER_OUT` with neither special key → created (only the base
  `inventory.write` guard applies).
- [x] Both the v2 CQRS create path and the legacy REST create path enforce it.
- [x] Query filters still scope by `actor.organizationId`/`branchId`; mutation stays idempotent.

## Definition of Done

- [x] `pnpm --filter @erp/api test` + `lint` green with new specs.
- [x] English-only error message (e.g. `Missing permission for goods issue purpose DISPOSAL`).
- [x] No `openapi:generate` needed (no DTO/endpoint shape change).

## Tech Approach

```ts
export function assertPurposePermission(/* … */) { /* switch on purpose → key → hasPermission */ }

// create-goods-issue-v2.handler.ts
constructor(private readonly dataSource: DataSource,
            private readonly goodsIssueService: GoodsIssueService,
            private readonly rbac: RbacService) {}
// in execute(): await assertPurposePermission(this.rbac, actor, dto.purpose ?? GoodsIssuePurpose.OTHER);
```

## Testing Strategy

- `*.spec.ts`: stub `RbacService.hasPermission`; assert Forbidden vs success across the three
  purposes and both entry paths.

## Dependencies

- Depends on: TKT-GIP-01.
- Blocks: TKT-GIP-03 (FE mirrors this gate).
