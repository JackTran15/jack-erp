# TKT-CSR-07 openapi:generate + api-client snapshot

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Regenerate the typed API client after the endpoint/contract changes (new `filter-options` route,
reshaped `columns`/`search` request+response) so the FE consumes generated types, not hand-written ones.

## Deliverables

- Run the API locally (`make dev-api`, port 4000) with the CSR-03/04/05/06 changes merged.
- `pnpm openapi:generate` → regenerates `packages/api-client/src/generated/schema.ts`.
- Commit `openapi.snapshot.json` + generated `schema.ts` (do **not** hand-edit the generated file).

## Acceptance Criteria

- [ ] `GET /reports/invoices/filter-options` present in the snapshot with `type` enum + `IDropdownOption[]`
      response.
- [ ] `GET /reports/invoices/columns` response = `{ summaryLabel, columns[] }` with enriched column type.
- [ ] `POST /reports/invoices/search` request includes new filter fields; response = `{ rows, totals, total }`.
- [ ] Generated `schema.ts` typechecks; no manual edits.

## Definition of Done

- [ ] `pnpm openapi:generate` run against the live API; snapshot diff committed.
- [ ] `pnpm --filter @erp/api-client build` passes.

## Tech Approach

- Standard repo flow: API up → `pnpm openapi:generate` → review diff is limited to the report endpoints
  → commit snapshot + generated schema.

## Testing Strategy

- N/A (generation step); validated by FE typecheck in CSR-08.

## Dependencies

- Depends on: TKT-CSR-03, TKT-CSR-04, TKT-CSR-06 (all endpoint changes landed).
- Blocks: TKT-CSR-08.
