---
feature: untracked-location-summary-report
slug: 2026092101-untracked-location-summary-report
owner: Akenzy
created: 2026-09-21
status: draft
---

# Intent — "Ngừng theo dõi" must hide a pair from the stock summary, and a tracked pair must show up on the sales report

Source: QA bug **#10 "Chi tiết vị trí hàng hoá - Ngừng theo dõi"**, 2026-09-21, three screenshots
from `erp.giaymt.com.vn`, branch "Chi nhánh Long Xuyên", SKU `TRUC79903`.

> Verbatim: *"Tổng hợp tồn kho: Vẫn hiển thị chi tiết vị trí đã ngừng theo dõi -> Ko hiển thị mới
> đúng. Chi tiết doanh thu theo hóa đơn và mặt hàng: Chi tiết vị trí rỗng -> Hiển thị được vị trí
> đang hoạt động"*

Two symptoms, one concept. `stock_balances.is_tracked` is the per-(item × location) "Đang theo
dõi / Ngừng theo dõi" flag (`stock-balance.entity.ts:34-37`: *"false = ngừng theo dõi vị trí này
(hidden from stock summary, excluded from arrange defaults)"*). Two read paths disagree with it in
opposite directions.

## Problem

### (a) "Tổng hợp tồn kho" → "Chi tiết hàng hóa" still lists pairs that were stopped

The dialog is `POST /v2/inventory/stock/summary/sku-breakdown` →
`StockSummaryDetailService.getSkuBreakdown` (`stock-summary-detail.service.ts:142`). Its row set is
the `cells` CTE (`:165-180`), a `UNION` of two arms:

1. `stock_balances` rows **with `sb.is_tracked = true`** (`:171`) — correct;
2. every `(item, location)` pair that has **any** `stock_ledger_entries` row before the period
   end (`:173-179`) — **no `is_tracked` check at all**.

A pair that was stopped keeps its ledger history (stopping only flips the flag,
`stock-ledger.service.ts:731-742`; nothing is deleted — decided 2026-09-04, A-04 of
`2026090401-untracked-location-hidden`). So arm 2 puts it straight back. In the screenshot every
`TRUC79903-*` variant shows an `E01.01` row at `0 / 0` next to its live `K09.01` row, while the
"Chi tiết vị trí hàng hóa" page (filter "Đang theo dõi") lists only `K09.01` for the same SKUs.
The parent grid itself is right: `stock-summary.service.ts:1197-1199` filters
`sb.is_tracked = true`, which is why QA pointed at the dialog and not the grid.

### (b) "Chi tiết doanh thu theo hóa đơn và mặt hàng" shows an empty "Mã vị trí" for a tracked pair

The column is not the invoice line's `location_id`; it is the item's *current* warehouse shelf,
resolved on every load by the shared `resolveItemWarehouseLocations`
(`report-core/item-warehouse-location.util.ts:70`, rationale at `:33-45` and
`invoice-item-revenue-detail.report.ts:508-517`). A shelf counts when it is the item's preferred
shelf (`item_storage_locations`) **or** a `stock_balances` row with `quantity > 0 AND is_tracked`
(`:206-215`, the `sb.quantity > 0` predicate at `:211`).

`TRUC79903-K-35` sold on invoice `2609190044` (19:01, 2026-09-19). Its only warehouse pair,
`K09.01` in "Kho LX", is **"Đang theo dõi" at quantity 0** (screenshot 1, row 10) and has no
preferred-shelf mapping, so neither arm matches and the cell is empty — while the page that
defines "đang theo dõi" says the item lives on `K09.01`. The user's own words: *"Hiển thị được
vị trí đang hoạt động"* — the tracked shelf is the active one, stock or no stock.

This is the same rule Akenzy already fixed for "Vị trí hàng hóa" on 2026-09-04 (A-03 of
`2026090401-untracked-location-hidden`: *"Đã xếp" chỉ xét `is_tracked`, **không** xét
`quantity > 0` — lọc theo số lượng sẽ ẩn nhầm kệ đang theo dõi mà tạm hết hàng*). The resolver
predates that decision and still filters by quantity.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Nhân viên kho reading "Chi tiết hàng hóa" | Sees shelves they explicitly retired via "Ngừng theo dõi", as `0 / 0` rows | Sees only the pairs that are "Đang theo dõi" — the same set as "Chi tiết vị trí hàng hóa" |
| Kế toán / support reading the sales detail report | "Mã vị trí" is blank the moment a shelf hits zero, even though the shelf is still the item's tracked one | "Mã vị trí" names the tracked warehouse shelf, at any quantity |

## Success signal

On a branch reproducing the bug:

- **(a)** For a SKU with one pair marked "Ngừng theo dõi" that still has ledger history, the
  "Chi tiết hàng hóa" dialog lists **only** its tracked pairs; the stopped pair's row is gone
  from every page, `total`, `itemCount` and the footer. Re-tracking the pair brings the row back.
- **(b)** For an item whose only warehouse pair is tracked at quantity 0 and has no preferred
  shelf, "Chi tiết doanh thu theo hóa đơn và mặt hàng" prints that shelf's code in "Mã vị trí"
  (e.g. `K09.01`). A pair marked "Ngừng theo dõi" stays excluded (AC-04 of
  `2026091002-report-multi-location-column` keeps passing).

## Out of scope

- **The parent "Tổng hợp tồn kho" grid.** Its `SL tồn` already excludes stopped pairs
  (`stock-summary.service.ts:1199`). Its period columns (`Tồn đầu kỳ` / `SL nhập` / `SL xuất`) sum
  the ledger per (item × storage) with no pair-level `is_tracked` check (`:409-427`); whether
  they should was A-02 — resolved 2026-09-21 by Akenzy: dialog only, the grid is not touched.
- **Showroom fallback for the revenue / profit reports.** Unchanged: an item that only sits on the
  showroom floor still prints an empty cell there (AC-08 of `2026091002`, rationale at
  `item-warehouse-location.util.ts:39-45`). If some of the other blank cells in screenshot 3
  (`AK2520-K-44`, `VOATC-D`, …) are showroom-only items, they stay empty — A-03, resolved 2026-09-21.
- **Deleting or migrating `stock_balances` / `item_storage_locations` rows.** Stopping stays a
  read-side filter (A-04 of `2026090401`); nothing here writes data.
- **"Chi tiết tồn kho" (ledger card, `getLedgerCard`)** — a stock card is history by definition
  and does not filter by tracking today; not part of the report.
- **Frontend changes.** Both symptoms are backend row sets; `SkuBreakdownDialog.tsx` and the
  report registry render whatever the API returns.

## Constraints

| Kind | Detail |
| --- | --- |
| Blast radius (b) | `resolveItemWarehouseLocations` is shared by **four** reports — `stock-summary.report.ts:283` (Tổng hợp nhập xuất tồn kho, with `showroomFallback`), `invoice-item-revenue-detail.report.ts:535`, `revenue-by-item.report.ts:290`, `profit-by-item.report.ts:227`. Dropping `quantity > 0` changes all four the same way; the 2026-09-10 decision to keep the four in lock-step stands |
| Invariant | A stopped pair always has `quantity = 0` — `setBalanceTracking` refuses otherwise (`stock-ledger.service.ts:704-728`, *"Chỉ được ngừng theo dõi khi tồn = 0"*). So (a) can never hide stock, and a fixture for it must build the stopped pair at 0 |
| Consistency (a) | The dialog's footer is documented to equal the parent grid's cell for pending transfers (`stock-summary-detail.service.ts:31-35`). For the period columns that equality holds today only because both sides ignore `is_tracked`; see A-02 |
| Performance (b) | Removing the quantity predicate enlarges the balance result set by every tracked zero-quantity row in the page's items — the same rows "Chi tiết vị trí hàng hóa" already lists per page. The query keeps its `itemId IN` / `isTracked` / `loc.isActive` / `storageId IN` predicates and its four-query budget (A-11 of `2026091002`) |
| Tests | Unit spec for the resolver mocks the query builder and ignores SQL text (`item-warehouse-location.util.spec.ts:96-125`), so the quantity predicate is only provable end-to-end; the breakdown service spec covers `getLedgerCard` only (`stock-summary-detail.service.spec.ts`) — `getSkuBreakdown` has no test at all |

## Existing surface touched

- `apps/api/src/modules/inventory/ledger/stock-summary-detail.service.ts` — `cells` CTE, ledger
  arm (`:173-179`). Fix site for (a).
- `apps/api/src/modules/reporting/report-core/item-warehouse-location.util.ts` — the stocked-shelf
  query (`:206-215`) and the doc comment that states the rule (`:43-46`). Fix site for (b).
- `apps/api/src/modules/reporting/report-core/item-warehouse-location.util.spec.ts` — fixture
  `build()` and the AC-03 / A-11 cases that pin the current arms.
- E2E precedent to copy: `apps/api/test/e2e/untracked-location-visibility.e2e-spec.ts`
  (`putBalance` / `setTracking` helpers through the real `PATCH /inventory/stock/balances/tracking`),
  `inventory-report-v2.e2e-spec.ts:55-61` (raw `stock_ledger_entries` insert),
  `invoice-item-revenue-detail.e2e-spec.ts` (report fixture + `/reports/invoices/search`).
- Read-only context: `stock-summary.service.ts:1197-1199` (grid filter), `:409-427` (period
  query), `inventory-location-stock.service.ts:195-223` (arrange creates a tracked 0-qty row —
  the very shape that (b) must now report).
