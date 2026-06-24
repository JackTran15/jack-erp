# TKT-CSR-05 Search: store-scope consolidation + new filters

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

The heavy ticket. Wire the new `reportFilters` into the 4 report definitions' `buildData`/aggregators:
multi-branch consolidation (`store` scope), `statDateType`, multi `invoiceStatus`, `productType`,
reconciled `statBy`, `statisticByBrand`, `allocateComboRevenue`. Apply only the filters each report
actually uses (per doc §B.1.2–§B.4.2); ignore the rest.

## Per-report filter matrix (from doc)

| report | store | invoiceStatus | statDateType | cashier/sales/customer | categoryId | brand | productType | statBy | statisticByBrand | allocateCombo |
|---|---|---|---|---|---|---|---|---|---|---|
| daily-sales-summary | ✓ | | | | | | | | ✓ | |
| invoice-order-listing | ✓ | ✓ | ✓ | ✓ | | | | | | |
| invoice-item-revenue-detail | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | |
| revenue-by-item | ✓ | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/report-definition.ts` (or a shared scope helper) —
  `resolveStoreScope(store, actor)`: `scope:'all'` → all org branches the actor may read;
  `scope:'group'` → validate `storeIds ⊆ actor org branches` (else `BadRequestException`/403); return
  `branchIds: string[]`. Reuse/extend existing `resolveBranchScope` (currently single-branch, gated on
  `reporting.invoice.consolidated.read`). Multi-store / `all` requires the consolidated permission.
- The 4 `reports/*.report.ts` + `*.aggregator.ts`:
  - `WHERE branch_id IN (:branchIds)` instead of single branch.
  - `statDateType`: `invoice_date` → filter/SQL on `issuedAt`; `created_date` → on `createdAt`.
  - `invoiceStatus: string[]` → `status IN (...)`; still always exclude `CANCELLED` unless explicitly
    selected. (Keep single `status` back-compat: if `invoiceStatus` absent, fall back to `status.value`.)
  - `revenue-by-item`: `productType` filter on item type; `statBy` grain `item|parent|group`;
    `statisticByBrand` adds brand grouping/column; `allocateComboRevenue` splits combo line revenue
    across components in-memory.
  - `daily-sales-summary` + `revenue-by-item`: `statisticByBrand` toggles brand split.
- Keep aggregation **in-memory** (fetch raw rows, compute in JS) per repo convention — do not push
  GROUP BY into SQL.

## Acceptance Criteria

- [ ] All SQL scoped by `actor.organizationId` AND `branch_id IN (resolved storeIds)`; `storeIds` not in
      the actor's org → rejected (no cross-tenant leak).
- [ ] `store.scope='all'` and multi-store require `reporting.invoice.consolidated.read`; single own
      branch works without it.
- [ ] Consolidated totals == sum of per-branch runs (verified by spec).
- [ ] `statDateType='created_date'` filters on `createdAt`, not `issuedAt`.
- [ ] `invoiceStatus=['completed','cancelled']` includes cancelled; default still excludes it.
- [ ] `statBy='parent'` groups revenue-by-item by parent SKU; `statisticByBrand=true` adds brand grain.
- [ ] Reports ignore filters not in their matrix row (no error, no effect).

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- aggregator` and `-- report` green (update existing specs).
- [ ] `pnpm --filter @erp/api lint` passes.
- [ ] No Vietnamese in backend source. No raw GROUP BY for the aggregate views.

## Tech Approach

```ts
const branchIds = await resolveStoreScope(dto.filters.store, actor); // validates org membership
const dateCol = dto.filters.statDateType === 'created_date' ? 'createdAt' : 'issuedAt';
const statuses = dto.filters.invoiceStatus?.length
  ? dto.filters.invoiceStatus
  : defaultStatusesExcludingCancelled();
const invoices = await this.invoices.find({
  where: { organizationId: actor.organizationId, branchId: In(branchIds),
           [dateCol]: Between(from, to), status: In(statuses) },
});
// aggregate in JS → keyed rows (shape handled in CSR-06)
```

## Testing Strategy

- Unit per report: seed invoices across 2 branches → assert `scope='group'` sums both, `scope` single
  isolates; `statDateType` switch; multi-status; `statBy`/`statisticByBrand`/`allocateComboRevenue`.
- Negative: `storeIds` from another org → 400/403.

## Dependencies

- Depends on: TKT-CSR-02.
- Blocks: TKT-CSR-06.
