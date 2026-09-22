---
id: UOW-02
slug: report-shelf-tracked-not-stocked
title: Report location column names a tracked shelf even at quantity 0
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: revert the one commit — `sb.quantity > 0` returns to the resolver and all four reports go back to blanking empty shelves; no data was written
---

# UOW-02 — Report location column names a tracked shelf even at quantity 0

## Demo script

1. Backoffice → Kho hàng → "Chi tiết vị trí hàng hóa", filter "Đang theo dõi", find an item
   whose only warehouse row is at quantity 0 (e.g. `TRUC79903-K-35` on `K09.01`, Kho LX) and that
   was sold on a recent invoice.
2. Báo cáo → Bán hàng → "Chi tiết doanh thu theo hóa đơn và mặt hàng", date range covering that
   invoice, branch scope. The line's "Mã vị trí" reads `K09.01` (it was empty before).
3. On "Chi tiết vị trí hàng hóa", select that `K09.01` row and press "Ngừng theo dõi". Reload the
   report: the cell is empty again. Turn tracking back on: `K09.01` returns.
4. Báo cáo → Kho → "Tổng hợp nhập xuất tồn kho" for the same branch: the same item shows `K09.01`
   and does **not** show the showroom "Mặc định" shelf; "Doanh thu theo mặt hàng" and "Lợi nhuận
   theo mặt hàng" show `K09.01` as well.
5. `pnpm --filter @erp/api test -- item-warehouse-location.util.spec.ts` and
   `pnpm --filter @erp/api test:e2e -- revenue-detail-location-tracked-empty` are green.

## In scope

- `resolveWithinStorages` no longer filters the stocked-shelf query by `quantity > 0` (ADR-02);
  comments updated to state the rule as tracked-ness.
- Unit spec: fixture balances carry a `quantity`, the query-builder mock honours a `quantity > 0`
  predicate if one is applied, and a new case proves a tracked shelf at 0 is reported and an
  untracked one at 0 is not.
- E2E on the revenue detail report proving AC-06/AC-07 through `/reports/invoices/search`.

## Not in scope

- Showroom fallback in the revenue/profit reports (A-03).
- Any change to the four callers, `joinShelves`, or the preferred-shelf arm.

## Risks

| Risk | Mitigation |
| --- | --- |
| Location cells get longer on branches with many tracked-but-empty shelves | Same shelves "Chi tiết vị trí hàng hóa" already lists; "Ngừng theo dõi" is the user's pruning tool and now visibly affects the reports too (demo step 3) |
| A-01 resolves the other way after implementation | One-line revert of the predicate plus the spec case; ADR-02 records the reversal |

## Definition of done

- [x] AC-06, AC-07 pass end-to-end (`revenue-detail-location-tracked-empty.e2e-spec.ts` green)
- [x] AC-08 pinned by the resolver unit spec (shared function, same arguments in all four callers)
- [x] Existing resolver spec cases AC-01..06 / AC-14 / AC-16 / A-06 / A-08 / A-11 of `2026091002` still green unchanged (assertions untouched; their `balances` fixture rows gained the now-required `quantity: 1`)
- [x] Demoed and accepted at gate G4 — accepted by Akenzy 2026-09-22
