# TKT-ACSFE-01 FE data layer: v2 search registry + filter→body mapper + hooks

## Epic

[EPIC-03062026 Backoffice admin list server-side search — FE wiring](../epics/EPIC-03062026-admin-list-cqrs-search-fe.md)

## Summary

Build the shared FE pieces the pages consume: a per-entity registry naming each v2 search path + its filterable fields, a mapper from `ColumnFilter` state → v2 request body, and TanStack Query hooks that POST to the v2 endpoints.

## Deliverables

- `apps/backoffice-web/src/components/crud/crudV2Search.ts`:
  - `CRUD_V2_SEARCH: Record<entityKey, { path: string; fields: Record<fieldKey, 'string'|'enum'|'boolean'|'date-range'> }>` for `customers`, `inventory-providers`, `job-positions`, `accounts`.
  - `MODE_TO_STRING_OP: Record<ColumnFilterMode, '*'|'='|'+'|'-'|'!'>` (reuse `COLUMN_FILTER_MODE_OPTIONS` symbols).
  - `buildV2Body(filters, dateRanges, cfg, page, limit)` → `{ page, limit, [field]: StringFilter | EnumFilter | boolean | DateRangeFilter }`. Skips empty values; only emits keys present in `cfg.fields` (respects backend `forbidNonWhitelisted`).
- `apps/backoffice-web/src/components/crud/useCrudV2Search.ts`:
  - `useCrudV2Search(entityKey, body, enabled)` — `useQuery`, key `["crud-v2", entityKey, body]`, `erpApi.POST(cfg.path, { body })`, `placeholderData: (prev) => prev`. Returns `{ data, total, page, limit }`.
- `apps/backoffice-web/src/hooks/iam/useEmployeeSearch.ts` (for TKT-ACSFE-04): `useEmployeeSearch(body)` → `POST /v2/employees/search`, returns `{ data: UserListItem[], total, ... }`.

## Acceptance Criteria

- [ ] `buildV2Body` maps: `string` → `{ operator: MODE_TO_STRING_OP[mode], value }`; `enum` → `{ value }`; `boolean` → `true|false`; `date-range` → `{ from?, to? }` (omit when both empty). Empty/whitespace values omitted entirely.
- [ ] No key outside `cfg.fields` is ever emitted.
- [ ] Hooks return the `{ data, total, page, limit }` envelope; `limit` is surfaced for the UI to map to `pageSize`.
- [ ] Types come from the generated `@erp/api-client` schema where available; otherwise local interfaces mirror the v2 DTOs.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (tsc) passes.
- [ ] No change to existing hooks/components in this ticket (pure additions).

## Tech Approach

```ts
// crudV2Search.ts
export const CRUD_V2_SEARCH = {
  customers: { path: '/v2/customers/search',
    fields: { code:'string', name:'string', email:'string', phone:'string', status:'enum', createdAt:'date-range' } },
  'inventory-providers': { path: '/v2/inventory-providers/search',
    fields: { code:'string', name:'string', email:'string', phone:'string', taxCode:'string',
              type:'enum', isActive:'boolean', isCustomer:'boolean', createdAt:'date-range' } },
  'job-positions': { path: '/v2/job-positions/search',
    fields: { name:'string', code:'string', isActive:'boolean', createdAt:'date-range' } },
  accounts: { path: '/v2/accounts/search',
    fields: { code:'string', name:'string', type:'enum', isActive:'boolean', createdAt:'date-range' } },
} as const;
```

## Dependencies

- Depends on: regenerated `@erp/api-client` (the 5 v2 operations).
- Blocks: TKT-ACSFE-03, TKT-ACSFE-04.
