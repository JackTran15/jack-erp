---
id: UOW-01
slug: breakdown-hides-stopped-pair
title: Breakdown dialog (Chi tiết hàng hóa) lists only the pairs that are still tracked
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: low
status: todo
rollback: revert the one commit — the ledger arm of `cells` loses its `NOT EXISTS` and the dialog shows stopped pairs again; no data was written
---

# UOW-01 — "Chi tiết hàng hóa" lists only the pairs that are still tracked

## Demo script

1. Backoffice → Kho hàng → "Chi tiết vị trí hàng hóa". Pick a SKU that sits on two shelves of
   the same warehouse (e.g. `E01.01` and `K09.01`), with quantity 0 on the first. Select the
   `E01.01` row, press "Ngừng theo dõi", confirm. Switch the "Trạng thái" filter to "Ngừng theo
   dõi" — the row is there; back to "Đang theo dõi" — only `K09.01`.
2. Kho hàng → "Tổng hợp tồn kho", same branch, filter that SKU, click its code in the warehouse
   row → "Chi tiết hàng hóa". Only the `K09.01` row is listed; "Số hàng hóa = N" and the footer
   count it alone. Set "Tháng này" as the period: still no `E01.01` row, even though it has
   receipts/issues this month.
3. Back on "Chi tiết vị trí hàng hóa", filter "Ngừng theo dõi", select the `E01.01` row and turn
   tracking back on. Reopen the dialog: the `E01.01` row is back with its period figures.
4. `pnpm --filter @erp/api test:e2e -- sku-breakdown-untracked` is green (AC-01..05).

## In scope

- `StockSummaryDetailService.getSkuBreakdown`: ledger arm of the `cells` CTE excludes any pair
  whose `stock_balances` row has `is_tracked = false` (ADR-01).
- Unit spec pinning the predicate; e2e suite proving the row set, period behaviour, re-track,
  and the no-balance-row case through the real endpoints.

## Not in scope

- The parent grid's period columns (A-02 — separate ticket only if it resolves the other way).
- `getLedgerCard` ("Chi tiết tồn kho").
- Any frontend change (A-05).

## Risks

| Risk | Mitigation |
| --- | --- |
| Dialog period footer drifts from the parent grid cell when a stopped pair moved in-period | Named in ADR-01 and A-02; the demo's step 2 picks a pair with no in-period movement so the drift is not mistaken for the fix failing, and A-02 decides whether the grid follows |
| `NOT EXISTS` on a hot CTE slows the dialog | One unique-index probe per ledger row of one SKU group in one storage; same scan set as today. Note the `EXPLAIN` on a 1k-row group in the ticket if it is not obviously flat |

## Definition of done

- [x] AC-01..05 pass (e2e `sku-breakdown-untracked.e2e-spec.ts` green)
- [x] `pnpm --filter @erp/api test -- stock-summary-detail.service.spec.ts` green, including the existing `getLedgerCard` cases
- [x] `getLedgerCard` untouched (diff confined to the `cells` CTE and the new spec/e2e files)
- [ ] Demoed and accepted at gate G4
