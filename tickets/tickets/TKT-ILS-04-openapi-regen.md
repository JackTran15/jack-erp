# TKT-ILS-04 OpenAPI regen + api-client snapshot

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Regenerate the OpenAPI snapshot and the generated api-client so the 3 new v2 search endpoints (`/v2/goods-receipts/search`, `/v2/inventory/goods-issues/search`, `/v2/inventory-item-categories/search`) are typed for the FE tickets (TKT-ILS-05/06/07). Pure tooling step — no hand edits to generated files.

## Deliverables

- `apps/api/openapi.snapshot.json` — regenerated.
- `packages/api-client/src/generated/schema.ts` — regenerated (do **not** hand-edit).

## Acceptance Criteria

- [ ] API running on :4000, then `pnpm openapi:generate` run from the repo root.
- [ ] The 3 new POST operations appear in `openapi.snapshot.json` with their request DTO shapes (`StringFilterDto`/`EnumFilterDto`/`DateRangeFilterDto`/`CompareFilterDto` + `page`/`limit`) and the `{ data, total, page, limit }` response.
- [ ] The generated `schema.ts` paths cover all 3 endpoints; `pnpm build:shared` succeeds.
- [ ] Diff is limited to the 3 added operations + their schemas — no unrelated churn (if unrelated drift appears, it means another uncommitted endpoint change is in the tree; isolate before committing).

## Definition of Done

- [ ] `openapi.snapshot.json` + `schema.ts` committed together, generated (not hand-edited).
- [ ] `pnpm --filter @erp/api build` + `pnpm build:shared` pass.

## Tech Approach

```bash
# terminal 1
make dev-api
# terminal 2 (once API is up on :4000)
pnpm openapi:generate
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

> Per the inventory-item-search-v2 memory: `openapi:generate` here can entangle with other uncommitted v2 work. Land TKT-ILS-01/02/03 first, regenerate on a clean tree, and verify the diff only adds the 3 operations.

## Dependencies

- Depends on: TKT-ILS-01, TKT-ILS-02, TKT-ILS-03 (all 3 endpoints must exist).
- Blocks: TKT-ILS-05, TKT-ILS-06, TKT-ILS-07 (FE consumes the regenerated client types).
