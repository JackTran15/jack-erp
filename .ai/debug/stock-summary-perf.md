# Debug report — `/api/v2/inventory/stock/summary/search` (8s) + report row cap

Status: **static analysis**. Postgres (:5433) and the API (:4000) were down when this was
written, so no `EXPLAIN ANALYZE` numbers. Every claim below is traced to a line of source;
the measurement recipe is at the end.

---

## 1. What one request actually does

Entry: `StockSummaryV2Controller.search` → `SearchStockSummaryV2Handler` →
`StockSummaryService.getSummary` (`apps/api/src/modules/inventory/ledger/stock-summary.service.ts:236`).

The backoffice grid (`InventoryManagementPage.tsx:88`) always sends `groupBy: "SKU"`,
`pageSize: 50`, and a period (`preset: this_month` → `startDate`/`endDate` always set).
It never sends `includeTotals`, so `wantsTotals = true` (`:272`).

That produces **6 SQL statements in 5 sequential stages**:

| # | Stage | Statement | Scope |
|---|-------|-----------|-------|
| 1 | A (parallel) | page query (`buildGroupedQuery` + `LIMIT 50`) | full GROUP BY over the branch's `stock_balances` |
| 2 | A (parallel) | totals query (`buildTotalsSql`) | **the same full GROUP BY again**, + 4 CTEs over the whole result set |
| 3 | B | `periodQuery` (`:311`) | ledger, page's pairs |
| 4 | C | `pendingTransferQuery` (`:340`) | `transfer_order_lines`, page's pairs |
| 5 | D | `reservationQuery` (`:388`) | `invoice_items`, page's pairs |
| 6 | E (page 1 only) | pending-only rows (`:466`) | `transfer_orders` × `items` |

Stages B, C, D, E are plain `await`s (`:331`, `:369`, `:414`, `:465`) even though they are
mutually independent — 4 serialized round trips that could be one `Promise.all`.

---

## 2. Root causes, ranked

### #1 — The footer totals scan the **entire ledger history** of every row in the report

`buildTotalsSql` (`:680`) builds:

```sql
WITH groups   AS (<the full grouped aggregate, no LIMIT>),
     pairs    AS (SELECT DISTINCT member_id, storage_id FROM groups, unnest(item_ids)),
     period   AS (SELECT SUM(CASE WHEN sle.posted_at < $start ...) ...
                  FROM stock_ledger_entries sle
                  JOIN locations loc ON loc.id = sle.location_id
                  JOIN pairs p ON p.item_id = sle.item_id AND p.storage_id = loc.storage_id
                  WHERE sle.organization_id = $org
                  <2× NOT EXISTS on goods_receipts / goods_issues>),
     pending  AS (... transfer_order_lines over all pairs ...),
     reserved AS (... invoice_items over all pairs ...),
     pending_only AS (...)
```

Two things make this the dominant cost:

* **`pairs` is the whole report, not the page.** In SKU mode each of the ~2,583 rows carries
  `array_agg(DISTINCT item.id)` — every variant of that product. 2,583 SKU rows expand to
  tens of thousands of (variant × storage) pairs.
* **`period` cannot be pruned by date.** Opening balance is `SUM(... WHERE posted_at < start)`,
  so there is no lower bound on `posted_at`. The only predicate is `organization_id`.
  Result: a full scan of `stock_ledger_entries` for the org, on **every keystroke-free page load**,
  plus two anti-joins per ledger row (`EXCLUDE_VOIDED_DOCS_SQL`, `:24`).

This exists purely to render one footer row.

### #2 — The heavy GROUP BY is computed twice, concurrently

`pageQb` (`:247`) and `aggQb` (`:263`) are two independent builds of the same
`buildGroupedQuery`. They run together in `Promise.all` (`:281`), so Postgres executes the
same aggregation of `stock_balances ⋈ items ⋈ locations ⋈ storages ⋈ categories ⋈ products`
twice at once — contending for the same buffers. The `LIMIT 50` on the page query saves
nothing: `GROUP BY … ORDER BY COALESCE(prod.code, MIN(item.code))` must materialize and sort
every group before the limit applies. `array_agg(DISTINCT item.id)` adds a per-group sort to both.

### #3 — The pair-joins are not sargable, so the planner may scan whole tables

All three follow-up queries join through `unnest($items, $storages) AS pair(...)`:

```sql
INNER JOIN unnest($4::uuid[], $5::uuid[]) AS pair(item_id, storage_id)
  ON pair.item_id = sle.item_id AND pair.storage_id = loc.storage_id
WHERE sle.organization_id = $3
```

There is no direct predicate on `sle.item_id`, and Postgres estimates a bare `unnest()` at
100 rows. If it picks a hash join it scans the full `stock_ledger_entries` / `invoice_items` /
`transfer_order_lines` even though only ~50 rows' worth of pairs are wanted. Adding a redundant
`AND sle.item_id = ANY($4::uuid[])` lets `IDX_…("organization_id","item_id","location_id")` drive
a nested loop instead. **This one needs `EXPLAIN` to confirm which plan is actually chosen.**

### #4 — `transfer_order_lines` has no index on `item_id`

Only `IDX_transfer_order_lines_order ("transfer_order_id")` exists
(`database/migrations/1780200000000-StockTakeAndTransferOrder.ts:119`). Both the page-level
`pendingTransferQuery` and the totals `pending` CTE join `line.item_id = pairs.item_id`, so each
request scans the whole table twice. Note the status filter sits on the join to
`transfer_orders`, not to `transfer_order_lines`, so *all* transfer lines ever written are read,
not just `IN_PROGRESS` ones.

### #5 — The reservation query reads all sales history to find draft invoices

`reservationQuery` (`:388`) starts from `invoice_items` by `item_id` (all invoices, all time)
and only afterwards narrows to `invoice.status IN ('draft','pending')` via a `LEFT JOIN` +
`WHERE invoice.id IS NOT NULL`. Draft/pending invoices are a handful of rows; the query should
be driven from `invoices` instead. `IDX_invoice_items_item_id` exists, so this is bounded by
"how many invoice lines has this SKU ever had" — for fast movers that's still large.

### #6 — The page-1 pending-only guard has a non-sargable `CASE` join

`pendingOnlyGuardSql(sku = true)` (`:900`) joins:

```sql
INNER JOIN items sibling ON ... AND (CASE WHEN item.product_id IS NULL
                                          THEN sibling.id = item.id
                                          ELSE sibling.product_id = item.product_id END)
```

A `CASE` in a join predicate cannot use an index — this is a scan of `items` (~20k rows) per
correlated evaluation, inside a `NOT EXISTS` that runs per transfer line. Only fires on page 1,
which matches "first load is slow, paging is faster" if that is the symptom you see.

### #7 — No caching, and derived filters disable paging entirely

There is no Redis layer on this endpoint (the inventory-*reports* module has one; this does not).
Separately: if the user sets any of the `openingQty / inQty / outQty / transferOutQty /
incomingQty` column filters, `needsDerivedFilter` (`:238`) **drops `LIMIT`/`OFFSET`** (`:258`)
and materializes every row, then runs stages B–D over the entire result set instead of 50 rows.
That path is much worse than 8s.

---

## 3. Fixes, by payoff-per-effort

**Cheap, low risk**

1. `Promise.all` stages B–E instead of 4 serial awaits. Saves 3 round trips.
2. `CREATE INDEX CONCURRENTLY idx_tol_org_item ON transfer_order_lines (organization_id, item_id);`
3. Add redundant sargable predicates (`AND sle.item_id = ANY($4::uuid[])`, same for
   `invoice_items` and `transfer_order_lines`) so the pair joins can use existing indexes.
4. Rewrite `reservationQuery` to start from `invoices` (status-filtered) and join down to
   `invoice_items`, not the other way round.

**Structural — this is where the seconds are**

5. Make the footer opt-in: have the grid pass `includeTotals: false` for pages ≥ 2 (or fetch
   totals in a second, non-blocking request). Today the DTO doesn't even expose the flag, though
   the service honours it — add it to `StockSummarySearchV2Dto`.
6. Kill the double aggregation: emit the page rows and `COUNT(*) OVER()` / `SUM(...) OVER()`
   from a single statement, or reuse the `groups` CTE for both.
7. Precompute opening balances (a periodic `stock_balance_snapshots` table, or a monthly
   rollup) so `period` becomes `snapshot + delta-since-snapshot` and gains a `posted_at >= $x`
   bound. Without this, cost grows linearly with ledger history forever — the endpoint gets
   slower every month regardless of the other fixes.

---

## 4. Issue 2 — `Report exceeds 50000 rows (74515)`

Thrown by `assertUnderRowCap` (`modules/reporting/report-core/row-cap.util.ts:22`).

**Why it fires.** The v2 report definitions
(`modules/inventory-reports/report/reports/*.report.ts`) call
`StockPeriodService.aggregate({ page: 1, pageSize: MAX_REPORT_ROWS })` — i.e. they ask for
*all* rows — then do column filtering, totals and pagination **in JavaScript**
(`applyColumnFilters` / `buildTotalsRow` / `paginateRows`, e.g. `stock-summary.report.ts:127-142`).
The cap is the guard that stops that from OOMing the API. At `groupBy: 'item_location'` your
org has 74,515 (item × location) pairs with a non-zero opening/in/out in the period, so the
report is refused outright. It is not a query bug — it is the in-memory design hitting its
ceiling.

**The fix already exists in the same module.** `StockPeriodService` supports server-side
column filters and SQL-side totals (`columnFilters` param, `periodTotalsSelect`, `:255-290`),
and the *legacy* path `inventory-reports.service.ts:138-141` uses them correctly — it passes
`page`, `pageSize` and `columnFilters` straight into SQL. The v2 definitions bypass all of it.
Porting them to pass `dto.page` / `dto.limit` / `dto.columnFilters` into `aggregate()` and to
return `result.totals` removes both the 50k cap and the 50k-row materialization.

Two caveats when doing that port:
* `filters.unit` and `filters.brand` are currently filtered in JS after the fact — they must
  move into SQL too, or totals and `total` will disagree with the grid.
* `transferOutQty` / `incomingQty` are still stitched in JS per page (`applyPendingTransfers`,
  `:430`) with a "first pending wins" dedup quirk; `buildRowKeysSql` exists specifically to keep
  the footer consistent. Don't regress that.

**Also worth knowing:** the report cache key hashes the whole DTO including `page`
(`searchCacheKey`, `report-data.util.ts`), so every page click is a cache miss that re-runs the
full 50k materialization. The 45s TTL only helps re-renders of the identical page.

**Immediate workaround for users:** narrow the period, pick a warehouse/branch, or switch the
"thống kê theo" dimension to `parent`/`group` (`itemGroupBy`), which collapses the spatial
dimension and drops the row count far below the cap.

---

## 5. How to confirm (run once Postgres is up)

```bash
docker compose up -d          # OrbStack must be running first
```

Table sizes and the actual pair cardinality:

```sql
SELECT count(*) FROM stock_ledger_entries WHERE organization_id = '<org>';
SELECT count(*) FROM stock_balances       WHERE organization_id = '<org>';
SELECT count(*) FROM transfer_order_lines;
SELECT count(*) FROM invoice_items;
```

Log the endpoint's real statements — add to `apps/api/src/database/data-source.ts` (and the
Nest `TypeOrmModule.forRoot` options) temporarily:

```ts
logging: ['query'],
maxQueryExecutionTime: 300,   // logs anything slower than 300ms with its SQL
```

Then hit the grid once and `EXPLAIN (ANALYZE, BUFFERS)` the statement that dominates —
expect it to be the `WITH groups … pairs … period …` totals query.
