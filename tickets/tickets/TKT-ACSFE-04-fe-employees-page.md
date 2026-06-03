# TKT-ACSFE-04 EmployeesPage: migrate to server-side v2 search

## Epic

[EPIC-03062026 Backoffice admin list server-side search — FE wiring](../epics/EPIC-03062026-admin-list-cqrs-search-fe.md)

## Summary

Swap `EmployeesPage` from `useUsers` (`GET /admin/users` + client-side `applyColumnFilter`) to `useEmployeeSearch` (`POST /v2/employees/search`) so the code / fullName / email / status column filters query the whole dataset server-side, with correct pagination. Row rendering (`UserListItem`: `code`, `fullName`, `profile.jobPosition`, status, `lastLoginAt`) is unchanged.

## Deliverables

- `apps/backoffice-web/src/pages/employees/EmployeesPage.tsx`:
  - Build the v2 body from the existing column filters: `code`/`fullName`/`email` → `StringFilter` (operator from the column mode); `status` (active/inactive) → `isActive` boolean.
  - Call `useEmployeeSearch(body)`; render `data.data` directly; remove the client-side `listRows` filtering.
  - Debounce filter input; reset page to 1 on filter change; `PaginationControls` uses the server `total`.
  - Drop column sort (createdAt DESC server-side).

## Acceptance Criteria

- [ ] Filtering by code / fullName / email / status narrows the whole employee set server-side; pagination total is correct.
- [ ] Rows still show `code`, `fullName` (firstName+lastName), email, status, `lastLoginAt`; the `profile.jobPosition` data remains available on the row (shape unchanged).
- [ ] Create / edit / deactivate / reload actions still work.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Manual: run the app, open `/admin/employees`, filter + paginate against the live API.

## Tech Approach

```ts
const body = useMemo(() => ({
  page: pagination.page,
  limit: pagination.pageSize,
  code:     strFilter(columnFilters.code),
  fullName: strFilter(columnFilters.fullName),
  email:    strFilter(columnFilters.email),
  isActive: columnFilters.status.value === 'true' ? true
          : columnFilters.status.value === 'false' ? false : undefined,
}), [columnFilters, pagination]);
const { data, isLoading } = useEmployeeSearch(useDebounced(body, 300));
const rows = data?.data ?? [];
```

## Dependencies

- Depends on: TKT-ACSFE-01 (`useEmployeeSearch` + mapper), TKT-ACSFE-02 (date-range cell — not required for employees but lands with it).
- Blocks: none.
