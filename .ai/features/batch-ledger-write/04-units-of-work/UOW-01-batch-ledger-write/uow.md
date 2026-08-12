---
id: UOW-01
slug: batch-ledger-write
title: Goods-receipt batch posting is O(1) DB round-trips instead of O(n)
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: pure code change, no migration, no feature flag — revert the two touched files to restore the sequential loops
---

# UOW-01 — Goods-receipt batch posting is O(1) DB round-trips instead of O(n)

## Demo script

1. Start the API against the local Postgres (`docker compose up -d`, `make dev-api`).
2. Seed an org/branch/warehouse matching the real case (`Showroom BMT`, location `DEFAULT`) —
   reuse `pnpm seed:inventory` fixtures or the e2e test's own seed.
3. Build a `CreateGoodsReceiptDto` with 1.686 lines from the real
   `NhapkhauHangHoaNhapKho SHOWROOM.xls` (same SKUs, same quantities, including the 6
   duplicated SKUs such as `TX3150-D` × 2).
4. `POST /goods-receipts` with that body, timing the request.
5. Show: response is 201/200 with `status: POSTED`, elapsed time is single-digit seconds
   (down from the 111-139s observed in production logs).
6. Query `stock_balances` for `TX3150-D` at `Showroom BMT / DEFAULT` — quantity reflects
   the summed delta (+2), not just the last line.
7. Query `stock_ledger_entries` for the same receipt — 1.686 rows, one per input line.

## In scope

- `ItemStorageLocationService.validateAndAssignBatch` (new batched method).
- `StockLedgerService.writeBatchMovements` and the pre-check loop inside
  `recordBatchMovements` (rewritten to call the batched path).
- Test coverage for the batched behaviour, including the real duplicate-SKU case and a
  large-batch timing check.

## Not in scope

- `GoodsReceiptService.createAndPost`'s generic error message (`goods-receipt.service.ts:183`).
- Any change to the Excel import/validate job flow.
- An explicit max-line-count guard on imports.

## Risks

| Risk | Mitigation |
|---|---|
| TypeORM `insert().values([...])` identifier order (A-01) | T-01-02 adds a runtime length/order defensive check plus a unit test asserting order under a batch with duplicate field values |
| Losing per-line detail in the negative-balance warning (A-03) | Accepted trade-off, confirmed non-blocking in `01-assumptions.md`; T-01-02's warning still names the affected item/location |
| Behaviour drift in the rare "repair" shelf-mapping case | Left as an unbatched per-row loop on purpose — low volume, same code path as today |

## Definition of done

- [ ] All of AC-01..07 pass
- [ ] `stock-ledger.service.spec.ts` and `item-storage-location.service.spec.ts` still pass
      unmodified in their existing cases, plus new cases for the batched paths
- [ ] New e2e test posts the real 1.686-line shape and asserts both correctness and timing
- [ ] No caller of `recordBatchMovements` needed a code change
- [ ] Demoed and accepted at gate G4
