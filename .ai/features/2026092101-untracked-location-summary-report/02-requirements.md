---
feature: untracked-location-summary-report
stories: 2
acceptance_criteria: 8
---

# Requirements — "Ngừng theo dõi" hides a pair from the stock summary; a tracked pair shows on the sales report

## US-01 — "Chi tiết hàng hóa" lists only the pairs that are still tracked

As a warehouse staff member, I want the "Chi tiết hàng hóa" dialog under "Tổng hợp tồn kho" to
show exactly the (item × location) pairs that are "Đang theo dõi", so that a shelf I retired
with "Ngừng theo dõi" stops showing up as a `0 / 0` row next to the live one.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — A stopped pair with ledger history is not a row
```gherkin
Given item X has a stock_balances row at shelf E01.01 with quantity 0 and is_tracked = false
  And stock_ledger_entries has at least one row for (X, E01.01) posted before the period end
  And item X has a tracked stock_balances row at shelf K09.01 in the same storage
When POST /v2/inventory/stock/summary/sku-breakdown is called for X's group and that storage
Then no row has locationId = E01.01
  And exactly one row has locationId = K09.01
  And total, itemCount and totals count only the K09.01 row
```

**AC-02** — Filtering by period does not bring the stopped pair back
```gherkin
Given the same data as AC-01
  And the (X, E01.01) ledger rows fall inside [startDate, endDate]
When sku-breakdown is called with that startDate and endDate
Then no row has locationId = E01.01
  And the footer's openingQty / inQty / outQty exclude the E01.01 movements
```

**AC-03** — A tracked pair at quantity 0 stays a row
```gherkin
Given item Y has a stock_balances row at shelf K09.01 with quantity 0 and is_tracked = true
When sku-breakdown is called for Y's group and that storage
Then one row has locationId = K09.01 with quantity 0
```
> Guards the other direction: the fix must key on `is_tracked`, not on quantity.

**AC-04** — Re-tracking restores the row
```gherkin
Given the stopped pair (X, E01.01) from AC-01
When PATCH /inventory/stock/balances/tracking sets it back to isTracked = true
  And sku-breakdown is called again
Then a row with locationId = E01.01 is present again, with its period figures
```

**AC-05** — A pair with ledger history but no balance row is unchanged
```gherkin
Given item Z has stock_ledger_entries rows at shelf E01.01 and no stock_balances row for (Z, E01.01)
When sku-breakdown is called for Z's group and that storage
Then a row with locationId = E01.01 is present, as today
```
> A-04: only an explicit `is_tracked = false` row hides a pair; the ledger arm keeps doing its
> job for pairs whose balance row was removed.

## US-02 — The report location column names a tracked shelf even when it is empty

As an accountant reading "Chi tiết doanh thu theo hóa đơn và mặt hàng", I want "Mã vị trí" to show
the item's tracked warehouse shelf, so that the cell does not go blank the moment the last unit on
that shelf is sold.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-06** — Tracked, empty, no preferred shelf → still reported
```gherkin
Given item K has a stock_balances row at warehouse shelf K09.01 with quantity 0 and is_tracked = true
  And item K has no item_storage_locations row in that warehouse
  And an invoice line for item K exists in the report's date range on that branch
When POST /reports/invoices/search is called for invoice-item-revenue-detail with locationCode in the columns
Then that line's locationCode is "K09.01"
```

**AC-07** — Stopped pair still excluded; tracked pairs still joined
```gherkin
Given item D has tracked balance rows at A101 (quantity 0) and A201 (quantity 0)
  And the pair (D, A101) has is_tracked = false
When the report is loaded
Then item D's locationCode is "A201"
```
> AC-04 of `2026091002` restated at quantity 0 — the untracked exclusion must survive the
> removal of the quantity predicate.

**AC-08** — Same rule in the other three reports
```gherkin
Given item K as in AC-06
When "Tổng hợp nhập xuất tồn kho", "Doanh thu theo mặt hàng" and "Lợi nhuận theo mặt hàng" are loaded for that branch
Then each prints "K09.01" in its location-code column
  And "Tổng hợp nhập xuất tồn kho" does not fall back to the showroom shelf for item K
```
> Covered by the shared resolver's unit spec (all four call the same function with the same
> arguments); no per-report e2e is added for the three.
