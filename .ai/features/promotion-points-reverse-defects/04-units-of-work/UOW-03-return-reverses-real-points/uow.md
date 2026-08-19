---
id: UOW-03
slug: return-reverses-real-points
title: Returning a no-accrual invoice takes no points
demoable: true
duration: 1d
depends_on: [UOW-02, UOW-05]
requirements: [US-03]
verifies: [AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: revert `computeReversePoints` and its two call sites — the cap is additive, so removing it restores today's money-derived behaviour exactly
---

# UOW-03 — Returning a no-accrual invoice takes no points

The third instance of the root cause, not reported by QA but found during discovery. Depends
on UOW-02 only for the payload contract (ADR-01), not for any of its logic.

## Demo script

1. Same setup as UOW-01: blocked promotion, invoice of 800.000đ, customer on 7.575 points,
   `points_earned = 0`. Do **not** cancel it this time.
2. In POS, Trả hàng → select that invoice → return every line → post the return.
3. Customer's card still reads **7.575**.
4. Point history has no negative row for the return; the `delta = 0` ADJUST marker is expected.
5. In the DB: the return document has `points_reversed = 0`.
6. Regression A — full return of an accruing invoice: sell 800.000đ with no promotion (earns
   80), return every line, card drops by exactly 80.
7. Regression B — partial return of the same accruing invoice: return lines netting 464.000đ,
   card drops by 46, unchanged from today.

## In scope

- `computeReversePoints(originalInvoice, totals)` = `min(floor(computeReverseBase / rate),
  originalInvoice.pointsEarned)`, per ADR-02, falling back to the uncapped money derivation
  when there is no original invoice (QUICK returns).
- Both consumers of that number: `invoice.pointsReversed` (line ~345) and the published
  `points` (line ~1122), so the snapshot and the card cannot drift apart the way they did
  in #16.

## Not in scope

- Re-deriving the reverse by prorating `points_earned` instead of capping. Rejected as A-02 —
  it rounds differently on partial returns and would move pinned expectations for no
  correctness gain.
- `computeReverseBase` itself, and everything `return-points-net-basis` decided about
  `returnedNet`. The cap sits on top of it and changes none of its inputs.
- The exchange (`OUT` goods) earn side, which is a separate publisher call and is correct.

## Risks

| Risk | Mitigation |
|---|---|
| `checkout-return.service.spec.ts` pins `subtotalDelta` at 464.000 / 800 / 190 and a full-return invariant on `amountDue` | The cap is a no-op on every one of those cases by construction. T-03-02's first done-when item is that none of them changed value |
| An original invoice from before `points_earned` was populated could read 0 and cap a legitimate reverse to nothing | The column is `int NOT NULL DEFAULT 0` and has been written by both checkout paths since before this feature; UOW-04's assessment will report any row where it is 0 while money moved. Flagged rather than assumed away |
| QUICK returns have no original to cap against | Explicit fallback, covered by AC-09, and the missing original is logged per the error taxonomy |

## Definition of done

- [x] AC-07, AC-08, AC-09 pass
- [x] Full return of a blocked invoice reverses 0 points and writes `points_reversed = 0`
- [x] Full return of an accruing invoice still reverses exactly its `points_earned`
- [x] Partial return numbers are byte-identical to today
- [x] `invoice.pointsReversed` and the published `points` come from the same function
- [x] `pnpm --filter @erp/api test` green across the whole API suite
- [ ] Demoed and accepted at gate G4