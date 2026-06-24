# TKT-CSR-09 Tests + E2E + DoD gate

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Close the epic with end-to-end coverage of the new contract: options endpoint, multi-branch
consolidation, statDateType, multi-status, keyed-row response, and text column operators — against the
`erp_test` database. Final DoD gate.

## Deliverables

- `apps/api/test/e2e/...` e2e spec for the report endpoints:
  - `GET /reports/invoices/filter-options` per `type` (dynamic + enum), org isolation, search, paging.
  - `GET /reports/invoices/columns` shape `{ summaryLabel, columns }` + `status.filterOptions`.
  - `POST /reports/invoices/search`:
    - consolidation: 2 branches, `store.scope='group'` → totals == sum of singles.
    - `statDateType` switch (invoice_date vs created_date).
    - multi `invoiceStatus`.
    - keyed rows + `total` before pagination.
    - text column filter (`contains`) + number compare.
    - permission: multi-store without `reporting.invoice.consolidated.read` → 403.
- Ensure unit specs from CSR-03/04/05/06 are green together.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test` (unit) green.
- [ ] `pnpm --filter @erp/api test:e2e` green against `erp_test` (serial, forceExit — read actual test
      output, not just the exit message; Kafka handles can masquerade as a failed suite).
- [ ] Cross-tenant negative cases covered (other-org `storeIds` → rejected).

## Definition of Done

- [ ] Full DoD of every CSR ticket met.
- [ ] `pnpm --filter @erp/api lint` passes.
- [ ] openapi snapshot + api-client committed (CSR-07).
- [ ] No Vietnamese in backend source; no TODO/FIXME outside the plan.
- [ ] Epic success metrics verified (4 reports fully API-driven, consolidation correct).

## Testing Strategy

- E2E against `erp_test` (auto-created + migrated by `global-setup.ts`); seed org + 2 branches +
  invoices spanning both; assert per the Acceptance Criteria.

## Dependencies

- Depends on: TKT-CSR-08 (and transitively all CSR tickets).
- Blocks: —
