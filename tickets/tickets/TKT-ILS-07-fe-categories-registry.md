# TKT-ILS-07 FE: inventory-item-categories CRUD_V2_SEARCH registry entry

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Activate server-side per-column search for the Nhóm hàng hoá list (`/admin/inventory-item-categories`). Because this page is the generic `CrudListPage`, the entire FE change is **one entry** in the `CRUD_V2_SEARCH` registry — `CrudListPage` then auto-routes its per-column filters to `POST /v2/inventory-item-categories/search`, drops the client-side `filteredRecords`, and paginates against the server `total` (same mechanism as the 5 ACS-FE entities).

## Deliverables

- `apps/backoffice-web/src/components/crud/crudV2Search.ts` — add one entry to `CRUD_V2_SEARCH`.

## Acceptance Criteria

- [ ] New registry entry:
  ```ts
  "inventory-item-categories": {
    path: "/v2/inventory-item-categories/search",
    fields: { code: "string", name: "string", createdAt: "date-range" },
  },
  ```
- [ ] On `/admin/inventory-item-categories`: the 3 columns (Mã nhóm hàng hóa, Tên danh mục, Ngày tạo) get filter cells — `code`/`name` as text (operator chips), `createdAt` as date-range — and filtering narrows the **whole** org dataset with server pagination.
- [ ] Rows render identically to today (full entity; `code`/`name`/`createdAt` unchanged).
- [ ] Every other CrudListPage entity is unaffected; create/duplicate/edit/delete on categories still work via the generic CRUD paths.

## Definition of Done

- [ ] App builds; the categories list loads, filters, and paginates against the live API.
- [ ] No other FE file changes needed (verified — CrudListPage reads the registry; `field.type` already drives the cell kind).

## Tech Approach

- The field map keys must match the `CrudEntityConfig` field keys (`code`, `name`, `createdAt`) and the v2 DTO accepted fields exactly; `forbidNonWhitelisted` on the backend rejects unknown keys, and the FE only sends keys present in `fields`.

## Dependencies

- Depends on: TKT-ILS-03 (endpoint), TKT-ILS-04 (regenerated api-client types). Reuses the `CRUD_V2_SEARCH` mechanism from the ACS-FE epic.
- Blocks: —
