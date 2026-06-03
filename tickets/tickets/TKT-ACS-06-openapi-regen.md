# TKT-ACS-06 OpenAPI regen + api-client snapshot

## Epic

[EPIC-03062026 Backoffice admin list server-side CQRS search](../epics/EPIC-03062026-admin-list-cqrs-search.md)

## Summary

After the five new `POST /v2/<entity>/search` endpoints land, regenerate the OpenAPI snapshot and the generated TS client so the api-client is typed for the follow-up FE-migration epic. No FE consumer is wired in this epic — this is hygiene that keeps `@erp/api-client` in sync.

## Deliverables

- `apps/api/openapi.snapshot.json` — updated (the five new search operations + request DTO schemas).
- `packages/api-client/src/generated/schema.ts` — regenerated (do **not** hand-edit).

## Acceptance Criteria

- [ ] API runs locally on `:4000`, then `pnpm openapi:generate` is run against `/docs-json`.
- [ ] The five `POST /v2/{customers,inventory-providers,job-positions,accounts,employees}/search` operations appear in `openapi.snapshot.json` with their `*SearchV2Dto` request bodies.
- [ ] Only the additive search operations + new DTO schemas changed; no unrelated diff churn.
- [ ] `pnpm --filter @erp/api build` + `pnpm build:shared` succeed with the regenerated client.

## Definition of Done

- [ ] `openapi.snapshot.json` + generated `schema.ts` committed (not hand-edited).
- [ ] No backend source change in this ticket (codegen only).
- [ ] Diff reviewed to confirm the existing `/records` and `/admin/users` operations are unchanged.

## Tech Approach

```bash
make dev-api            # API on :4000 (must be up for codegen)
pnpm openapi:generate   # regenerates packages/api-client from /docs-json
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Testing Strategy

- `git diff --stat` on the two generated files; confirm only the new operations/schemas are added and nothing existing is removed or altered.

## Dependencies

- Depends on: TKT-ACS-01, TKT-ACS-02, TKT-ACS-03, TKT-ACS-04, TKT-ACS-05 (all five routes on `AdminSearchV2Controller` must exist).
- Blocks: the follow-up FE-migration epic (it consumes the regenerated client types).
