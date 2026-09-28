# Debug report — "Chi tiết hàng hóa" still shows a retired location (QA defect #6)

Status: **root-caused from data, fixed.** Traced on `erp_dev_2709` (snapshot 2026-09-27).
This is a re-report of the case that feature `2026092101-untracked-location-summary-report`
(#289) set out to fix. That fix covered only one of the two ways a location gets retired.

> **6. Chi tiết vị trí hàng hoá - Ngừng theo dõi.** Chi nhánh Long Xuyên — mã TRUC79903
> đã Ngừng theo dõi ở vị trí E01.01. Nhưng Tổng hợp tồn kho - Chi tiết hàng hoá vẫn đang
> hiển thị? → Không hiển thị mới đúng.

---

## 1. What the data shows

Long Xuyên (`28e22f4f-…`), storage `9efe211a-…`, location E01.01 (`40438119-…`):

- `stock_ledger_entries`: TRUC79903-D-35…D-39 all have history there (NK000262 on 08-22,
  then a `LOCATION_CHANGE` out on 08-24). Every pair nets to **0**.
- `stock_balances`: **no row** for any of those pairs at E01.01. There is no row with
  `is_tracked = false` either.
- `item_storage_locations`: no E01.01 assignment left.

So nothing in the data says these pairs were stopped with "Ngừng theo dõi". Their balance
row was **deleted**.

## 2. Root cause

`StockSummaryDetailService.getSkuBreakdown` (`stock-summary-detail.service.ts`) built its
row set (`cells`) from:

1. tracked `stock_balances` rows, **UNION**
2. every (item, location) pair with ledger history, *minus* pairs that have a balance row
   with `is_tracked = false` (the #289 fix)

A pair whose balance row is gone is excluded by neither arm, so arm 2 brought E01.01 back
as a 0 / 0 row.

Balance rows get deleted in two places:
- `InventoryLocationStockService.removeItemFromLocation` ("Bỏ hàng hóa khỏi vị trí", only at
  quantity 0). It also clears the preferred-shelf assignment, which matches the data above.
- the generic CRUD `stock_balances` entity, `deletionPolicy: HARD`.

#289 knew about this case and deliberately kept it (assumption **A-04**, pinned by e2e
**AC-05**): "a pair whose balance row was deleted still flows through history". The QA
re-report shows that from the user's point of view, removing a pair retires it the same way
stopping it does. They expect neither to appear.

Scale: **557** (item, location) pairs in the org have ledger history and no balance row, and
all of them net to 0. Every one showed up as a phantom row in this dialog.

## 3. Fix — reverses A-04 of 2026092101

`cells` is now **tracked `stock_balances` rows only**. The ledger arm is removed.

Why that is safe: every stock movement upserts its balance row (`upsertBalance` /
`upsertBalancesBatch`), so a pair with history always has a balance row unless someone
deleted it on purpose. With the untracked exclusion added in #289, the ledger arm's only
remaining job was to bring back pairs that had been deliberately removed.

Consequence, the same one ADR-01 already accepted for stopped pairs: if a removed pair moved
inside the selected period, the dialog's period footer can come out smaller than the grid's
period cell.

Tests:
- `stock-summary-detail.service.spec.ts`: `cells` contains only the tracked-balance arm, with
  no `stock_ledger_entries` and no `UNION`. It is red on the old query and green on the new one.
- `test/e2e/sku-breakdown-untracked.e2e-spec.ts` AC-05 is flipped: a pair with history but no
  balance row is **not** a row. The whole suite passes 5/5, and AC-04 (re-tracking restores the
  row with its period figures) still passes.
- Real data: for TRUC79903-D-* in storage `9efe211a`, the new `cells` returns only K09.01
  (5 rows, total 2). That is what QA expects.

## 4. Not changed (follow-up candidates)

- `StockLedgerService.setBalanceTracking` is UPDATE-only. "Ngừng theo dõi" on a pair with no
  balance row returns `{ updated: 0 }` without an error. That is harmless for this dialog now,
  but it is a silent no-op.
- Other surfaces that read ledger history without a balance row (reports under
  `inventory-reports/`, `mobile-inventory-ledger.sql.ts` with `COALESCE(is_tracked, true)`)
  still treat a removed pair as tracked. They were not part of this defect.
