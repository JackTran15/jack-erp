# TKT-ACSFE-03 CrudListPage: gated server-side v2 search (4 CRUD entities)

## Epic

[EPIC-03062026 Backoffice admin list server-side search — FE wiring](../epics/EPIC-03062026-admin-list-cqrs-search-fe.md)

## Summary

Wire `CrudListPage` so that, for the 4 entityKeys in `CRUD_V2_SEARCH`, it fetches via `POST /v2/<entity>/search` (server-side filter + pagination) and drops the client-side `filteredRecords`. Every other entityKey is unchanged.

## Deliverables

- `apps/backoffice-web/src/components/crud/CrudListPage.tsx`:
  - Compute `const v2 = CRUD_V2_SEARCH[entityKey]`.
  - When `v2`: debounce `columnFilters` + `dateRanges`; build the body via `buildV2Body(...)`; call `useCrudV2Search(entityKey, body, enabled)`; render `records.data` **directly** (no `filteredRecords`); reset `page` to 1 on any filter/range change; set column `filterKind: "none"` for keys not in `v2.fields`, and `"date-range"` for date keys in `v2.fields`; disable column sort (no `onSort`).
  - When not `v2`: existing `useCrudRecords` + client-side filtering path, untouched.
  - Add `dateRanges` state + `onRangeChange` handler passed into `BaseDataTable`'s `columnFilterControl`.

## Acceptance Criteria

- [ ] For `customers` / `inventory-providers` / `job-positions` / `accounts`: typing a filter queries the whole dataset; `PaginationControls` shows the server `total`; results are not limited to the loaded page.
- [ ] Filter input is debounced (~300ms); changing any filter or date range resets to page 1.
- [ ] Only `v2.fields` columns are filterable; others show no filter cell. `createdAt` (where a date column exists, e.g. job-positions) uses the `date-range` cell.
- [ ] Non-v2 entityKeys: zero behavioral change (still GET `/records` + client filter + sort).
- [ ] Create / edit / delete / row→detail actions still work for the migrated entities.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Manual: run the app, open each of the 4 lists, filter + paginate against the live API; confirm total reflects the full dataset.

## Tech Approach

```ts
const v2 = entityKey ? CRUD_V2_SEARCH[entityKey] : undefined;
const debounced = useDebounced({ columnFilters, dateRanges }, 300);
const v2Body = useMemo(
  () => v2 ? buildV2Body(debounced.columnFilters, debounced.dateRanges, v2, page, pageSize) : null,
  [v2, debounced, page, pageSize],
);
const v2Query = useCrudV2Search(entityKey ?? "", v2Body, Boolean(v2 && v2Body));
const recordsData = v2 ? v2Query.data : useCrudRecords(...);   // pick source
const rows = v2 ? (recordsData?.data ?? []) : filteredRecords; // skip client filter for v2
```

## Dependencies

- Depends on: TKT-ACSFE-01 (registry/mapper/hook), TKT-ACSFE-02 (date-range cell).
- Blocks: none.
