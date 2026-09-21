---
feature: untracked-location-summary-report
adr_count: 2
---

# Logical design — one flag, two read paths brought in line

## Approach

Both fixes are read-side predicates on existing queries. No entity, migration, DTO, route or
frontend file changes; no data is written or backfilled.

### (a) `StockSummaryDetailService.getSkuBreakdown` — the `cells` CTE

The ledger arm of `cells` (`stock-summary-detail.service.ts:173-179`) gets one more predicate,
in the style of the neighbouring `EXCLUDE_VOIDED_DOCS_SQL`:

```sql
SELECT sle.item_id, sle.location_id
FROM stock_ledger_entries sle
INNER JOIN grp_items g ON g.id = sle.item_id
INNER JOIN locations loc
  ON loc.id = sle.location_id AND loc.storage_id = $3 AND loc.is_active = true
WHERE sle.organization_id = $1 AND sle.posted_at < $5
  -- A pair explicitly stopped ("Ngừng theo dõi") is not a row, whatever its history.
  AND NOT EXISTS (
    SELECT 1 FROM stock_balances ut
    WHERE ut.organization_id = $1
      AND ut.item_id = sle.item_id
      AND ut.location_id = sle.location_id
      AND ut.is_tracked = false
  )
  ${EXCLUDE_VOIDED_DOCS_SQL}
```

The balance arm (`:167-171`) already carries `sb.is_tracked = true` and is untouched. Because
`cells` feeds `balance`, `period` and `reserved` alike, the stopped pair disappears from the rows,
`total`, `itemCount` and every footer column in one place. `stock_balances` is unique on
`(organization_id, item_id, location_id)` (the `ON CONFLICT` target the e2e fixtures use), so
the `NOT EXISTS` is one index probe per candidate pair — the ledger arm is already grouped by the
`UNION`'s distinct, and the `NOT EXISTS` is evaluated per ledger row before that; on a SKU group
this is bounded by the group's ledger rows in one storage, the same set the CTE scans today.

A pair with **no** balance row at all (removed from the shelf at quantity 0) has nothing to match
`is_tracked = false` and keeps flowing through the ledger arm — A-04, AC-05.

### (b) `resolveWithinStorages` — the stocked-shelf query

Delete the line `.andWhere('sb.quantity > 0')` (`item-warehouse-location.util.ts:211`). The query
keeps `itemId IN`, `organizationId`, `isTracked = true`, `loc.isActive = true`,
`loc.storageId IN (warehouses)`. The doc comment that states the rule (`:43-46`, *"any shelf
there still holding stock"*) and the inline note at `:187-189` are rewritten to say "any shelf
there whose pair is still tracked". The preferred-shelf arm and its untracked cross-check
(`:191-204`) are unchanged: a preferred shelf whose pair was stopped is still dropped, which is
what keeps AC-07 green.

`joinShelves` and the showroom fallback need no change. The fallback still runs only for items
with no warehouse shelf; a tracked-but-empty warehouse shelf now counts as one, so the showroom
answer is used less often in "Tổng hợp nhập xuất tồn kho" — the intended reading of A-01.

### Why this is enough

`stock_balances.is_tracked` is the single source of truth for "Đang theo dõi"; after this change
the four report columns, the summary grid, the breakdown dialog and "Chi tiết vị trí hàng hóa"
all read it the same way: a tracked pair in an active location of an active storage is where the
item lives, at any quantity; a stopped pair is invisible to summaries, visible to history.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| (a) Wrap the whole `cells` union in an outer `WHERE NOT EXISTS` | Same result, but re-checks the balance arm that already filtered `is_tracked = true`; the predicate belongs on the one arm that was missing it |
| (a) `LEFT JOIN stock_balances` on the ledger arm and filter `COALESCE(sb.is_tracked, true)` | Equivalent, but the join changes the arm's row multiplicity and reads worse next to the existing `NOT EXISTS` blocks |
| (a) Also apply the predicate to the grid's `periodQuery` | Rejected by Akenzy under A-02 (2026-09-21): it changes figures the grid already shows and the bug names only the dialog |
| (b) Keep `quantity > 0` and write an `item_storage_locations` row whenever a balance row is created | A write-path change in every movement flow (receipt, transfer, adjustment, arrange) and it leaves every existing tracked-but-empty pair still blank; the report would depend on a mapping the user never chose |
| (b) Two-tier rule: shelves with stock first, tracked-empty shelves only when nothing has stock | A third round-trip and a rule nobody can state in one sentence; "Đã xếp" already rejected the quantity criterion for the same concept (A-03 of `2026090401`) |
| (b) Read `invoice_items.location_id` | Already rejected at `invoice-item-revenue-detail.report.ts:508-517`: POS books every sale against the showroom's "Mặc định" shelf |

## Contracts

No request or response shape changes.

### POST /v2/inventory/stock/summary/sku-breakdown
Row set semantics only: a `(item, location)` pair with `stock_balances.is_tracked = false` is never
a row, regardless of ledger history or period. `total`, `itemCount`, `totals` follow.

### POST /reports/invoices/search (invoice-item-revenue-detail) and the other three callers
`locationCode` / `locationName` / `locationStorage` semantics only: the union now includes every
tracked warehouse pair, not just those with stock. Empty cells remain empty for showroom-only
items in the three sales/profit reports (A-03).

## Error taxonomy

No new failure modes; both endpoints keep their existing ones.

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Stopped pair requested in the dialog | none — the row is simply absent | Dialog shows the tracked rows only |
| Item has no tracked warehouse pair and no preferred shelf | none — `{ code: null, name: null, storage: null }` as today | Empty cell (showroom fallback only where the caller asks for it) |
| `sku-breakdown` called without `groupKey` / `storageId` | existing `ValidationPipe` 400 | unchanged |

## ADRs

### ADR-01 — A stopped pair is hidden from the breakdown by a read-side `NOT EXISTS`, not by touching history
**Context:** The dialog's row set unions live balances with ledger history so that a pair that
moved in the period is still explainable. Stopping a pair only flips `is_tracked` (A-04 of
`2026090401`); its ledger rows stay, and the history arm had no tracking check, so the stopped
pair reappeared.
**Decision:** Add `NOT EXISTS (stock_balances … is_tracked = false)` to the ledger arm of
`cells`. Do not delete, rewrite or re-attribute ledger rows; do not filter the balance arm
twice; do not touch `getLedgerCard`.
**Consequences:** The dialog matches the grid's `SL tồn` and the "Chi tiết vị trí hàng hóa"
page. When a stopped pair moved inside the selected period, the dialog's period footer is
smaller than the grid's period cell — accepted under A-02 (dialog only). A pair
whose balance row was deleted is unaffected.
**Status:** accepted — A-02 resolved by Akenzy on 2026-09-21 (dialog only)

### ADR-02 — Tracked-ness, not quantity, defines a reported shelf
**Context:** `resolveItemWarehouseLocations` was written before "Ngừng theo dõi" existed at
pair level and used `quantity > 0` as its proxy for "the item is here". Once tracking became
explicit, quantity became a second, stricter criterion that blanks the column on the last sale.
The same tension was settled for "Đã xếp" on 2026-09-04 in favour of `is_tracked` alone.
**Decision:** Drop `sb.quantity > 0` from the stocked-shelf query. A warehouse shelf is
reported when its pair is tracked (and the location and storage are active), at any quantity.
Preferred shelves keep their existing untracked cross-check.
**Consequences:** All four reports print tracked-but-empty shelves; "Tổng hợp nhập xuất tồn
kho" falls back to the showroom less often. Rows per item grow by the item's tracked empty
shelves — the same rows "Chi tiết vị trí hàng hóa" lists — with no change to the query count.
Reverting is one line if A-01 resolves the other way.
**Status:** accepted — A-01 resolved by Akenzy on 2026-09-21
