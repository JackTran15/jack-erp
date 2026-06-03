# TKT-ILS-05 FE: Nhập kho (PurchaseOrdersPage) server-side filters

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Wire the Nhập kho page (`apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx`) to `POST /v2/goods-receipts/search`. Today it fetches `GET /goods-receipts` (pagination only) and renders an in-page table with **no** per-column filters; the screenshot shows the target filter row (Ngày, Số phiếu nhập, Đối tượng, Tổng tiền, Diễn giải, Lý do, Loại chứng từ). Add a server-side per-column filter row + debounce + server pagination. This is a bespoke page (not `CrudListPage`), so it does not use the `CRUD_V2_SEARCH` registry.

## Deliverables

- `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx` — add the filter row, debounced column-filter state, swap the data hook to the v2 search, read `row.totalAmount` for Tổng tiền.
- A small `ColumnFilter → v2 body` mapper for this page (reuse the shapes in `components/crud/crudV2Search.ts` — `StringFilter {operator,value}`, `DateRange {from,to}`, `Enum {value}`, `Compare {operator:"<=",value}` — extract a shared helper rather than duplicating if practical).
- A TanStack Query hook over `erpApi.POST<…>("/v2/goods-receipts/search", { body })` (queryKey `["goods-receipts-search", branchId, filters, page, limit]`).

## Acceptance Criteria

- [ ] The 7 columns render exactly as today (same labels, same cell formatting incl. `purpose` → "Điều chuyển từ cửa hàng khác" / "Phiếu nhập kho khác", date `toLocaleDateString("vi-VN")`, party `row.provider?.name`), with **Tổng tiền now read from `row.totalAmount`** instead of summing `row.lines`.
- [ ] Each column has a filter input matching its type: Ngày = date-range, Số phiếu nhập / Đối tượng / Diễn giải / Lý do = text (operator chips `* = + - !`), Tổng tiền = numeric `≤`, Loại chứng từ = enum select (`OTHER`/`TRANSFER_IN`).
- [ ] Typing in any filter (debounced, ~300 ms) issues **one** request against the whole org+branch dataset; changing any filter resets to page 1; `PaginationControls` reflects the server `total`.
- [ ] No client-side filtering of the loaded page remains.
- [ ] If any row-detail/expand on this page reads list-row `lines`, confirm it still works (detail dialog should fetch the full receipt via the existing `GET /goods-receipts/:id`); if it genuinely needs `lines` in the list row, raise it — TKT-ILS-01 would then also return `lines`.

## Definition of Done

- [ ] App builds (`pnpm --filter @erp/backoffice-web build`); the page loads, filters, and paginates against the live API.
- [ ] UI strings stay Vietnamese; primitives from `@erp/ui`; `erpApi`/`requireErpData` for fetching.
- [ ] No server data placed in Zustand (TanStack Query only).

## Tech Approach

- Reuse the existing column-filter UI primitives (`ColumnFilterModeControl` / `COLUMN_FILTER_MODE_OPTIONS` symbol map, the `date-range` and `number-range` cells added in the ACS-FE epic) so the filter row matches the generic CRUD look in the screenshot.
- Build the request body with the same field→filter mapping the registry uses: `{ documentNumber, party, description, reason }` as `StringFilter`, `purpose` as `Enum`, `date` as `DateRange`, `totalAmount` as `Compare`.
- Map the v2 `{ data, total, page, limit }` envelope back into the page's existing pagination state (`limit ↔ pageSize`).

## Dependencies

- Depends on: TKT-ILS-01 (endpoint), TKT-ILS-04 (regenerated api-client types). Reuses ACS-FE filter cells.
- Blocks: —
