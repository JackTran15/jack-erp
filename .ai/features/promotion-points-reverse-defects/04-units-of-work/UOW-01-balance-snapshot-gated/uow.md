---
id: UOW-01
slug: balance-snapshot-gated
title: The receipt shows the balance the card actually holds on a no-accrual sale
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert the one-line change in persist-invoice.step.ts — no schema change, no data written, no contract touched
---

# UOW-01 — The receipt shows the real balance on a no-accrual sale

Defect #15. Self-contained: one identifier in one file, plus the spec that proves it.
Deliberately not bundled with UOW-02 even though QA hit them in the same session — this one
touches no contract and can ship on its own the moment it is reviewed.

## Demo script

1. In the backoffice, create (or reuse) an invoice-discount promotion with
   "Tích điểm cho khách hàng" **unchecked**.
2. In POS with `VITE_CHECKOUT_V2=true`, attach a customer whose card holds 7.575 points.
3. Build a cart totalling 800.000đ, apply that promotion, complete the sale.
4. On the printed receipt: "Điểm tích lũy" reads **7.575**, not 7.655.
5. Open Chi tiết khách hàng → Lịch sử mua hàng → that invoice: the review dialog shows the
   same 7.575.
6. In the DB: `points_earned = 0`, `points_balance_after = 7575`, and `point_history` has no
   new row for that invoice.
7. Regression, same session: sell to the same customer with **no** promotion applied — the
   receipt's balance goes up by `floor(amountDue / 10 000)` exactly as before.

## In scope

- `persist-invoice.step.ts`'s `pointsBalanceAfter` projection reads the gated
  `invoice.pointsEarned` written thirteen lines above it, per ADR-03.
- The stale comment on lines 68-72 — which claims `pointsBalanceAfter` "has always been
  guarded this way" — corrected to say what is actually true.
- Spec coverage for the blocked case, which no test currently exercises.

## Not in scope

- The cancel path (UOW-02) and the return path (UOW-03) — same root cause, different files,
  and both need the payload contract this UoW does not touch.
- v1 `checkout-invoice.service.ts:285`. Its analogous line is benign: `cardBalance != null`
  already implies `customerId`, and v1 has no `pointsBlocked`, so its local `pointsEarned`
  and `invoice.pointsEarned` are identical there (rejected assumption A-08).
- The real v1 gap — that `accrue_points = false` is ignored end to end under the default
  `VITE_CHECKOUT_V2=off` build. Out of scope per `00-intent.md`; needs its own ticket.

## Risks

| Risk | Mitigation |
|---|---|
| The fix looks trivial enough to ship without a test, leaving the defect free to return the next time someone edits this block | T-01-02 is a separate ticket with its own review, not a checkbox inside T-01-01 |
| `persist-invoice.step.spec.ts` already pins `100 - 20 + 73 = 153`; a careless edit could move it | T-01-02 adds cases, changes none. AC-02 is stated as an explicit no-change regression |

## Definition of done

- [x] AC-01, AC-02, AC-03 pass
- [x] `points_balance_after` on a blocked invoice equals the card balance minus points
      redeemed, with no earn added
- [x] The comment block above the projection describes what the code does
- [x] `pnpm --filter @erp/api test -- persist-invoice.step.spec.ts` green
- [ ] Demoed and accepted at gate G4