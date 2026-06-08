# TKT-ILS-06 FE: Xuất kho (GoodsIssuePage) server-side filters

## Epic

[EPIC-03062026 Inventory list server-side CQRS search](../epics/EPIC-03062026-inventory-list-cqrs-search.md)

## Summary

Wire the Xuất kho page (`apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx`) to `POST /v2/inventory/goods-issues/search`. Same shape as TKT-ILS-05 (Nhập kho) — add a server-side per-column filter row + debounce + server pagination, reading `row.totalAmount` for Tổng tiền. Columns: Ngày, Số phiếu xuất, Đối tượng, Tổng tiền, Diễn giải, Lý do, Loại chứng từ.

## Deliverables

- `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx` — filter row, debounced state, swap to the v2 search hook, read `row.totalAmount`.
- The shared `ColumnFilter → v2 body` mapper (the one extracted/used in TKT-ILS-05).
- A TanStack Query hook over `erpApi.POST<…>("/v2/inventory/goods-issues/search", { body })` (queryKey `["goods-issues-search", branchId, filters, page, limit]`).

## Acceptance Criteria

- [ ] The 7 columns render exactly as today, including the **party cascade** (`row.provider?.name` → `row.targetBranch?.name` → `row.customerName` → "—") and the `purpose` → `PURPOSE_LABELS` mapping (`OTHER`/`SALE`/`TRANSFER_OUT`/`DISPOSAL`), with **Tổng tiền read from `row.totalAmount`**.
- [ ] Filter inputs by type: Ngày = date-range, Số phiếu xuất / Đối tượng / Diễn giải / Lý do = text, Tổng tiền = numeric `≤`, Loại chứng từ = enum select.
- [ ] Debounced single request against the whole org+branch dataset; filter change resets to page 1; `PaginationControls` reflects server `total`; the current "hide CANCELLED" default is preserved (the v2 endpoint mirrors it server-side).
- [ ] No client-side filtering of the loaded page remains.
- [ ] Đối tượng filter matches the same `COALESCE(provider/targetBranch/customerName)` the cell displays (so a typed value finds the row the user sees).

## Definition of Done

- [ ] App builds; page loads, filters, paginates against the live API.
- [ ] UI strings Vietnamese; `@erp/ui` primitives; `erpApi` fetching; no server data in Zustand.

## Tech Approach

- Identical to TKT-ILS-05 but with `notes` (Diễn giải) instead of `description`, and the body field set `{ documentNumber, party, notes, reason }` (String) + `purpose` (Enum) + `date` (DateRange) + `totalAmount` (Compare).
- Reuse the same filter-cell primitives + mapper extracted in TKT-ILS-05.

## Dependencies

- Depends on: TKT-ILS-02 (endpoint), TKT-ILS-04 (regenerated api-client types), TKT-ILS-05 (shared mapper/cells).
- Blocks: —
