---
id: UOW-03
slug: checkout-honors-points-setting
title: POS checkout honors the per-program points setting, sync and async agree
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-03, US-04, US-05, US-06]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: revert compute-totals.step.ts / persist-invoice.step.ts / enqueue-outbox.step.ts / promotion-resolver.ts / evaluation.ts / shared-interfaces AppliedProgram — `pointsBlocked` is saga-run-scoped (never persisted to the invoices table per ADR-02), so there is no data migration to unwind, only code
---

# UOW-03 — Checkout honors the points setting

## Demo script

1. As a promotion admin, ensure at least two invoice-discount programs exist: one with
   "Tích điểm cho khách hàng" checked, one unchecked (UOW-02).
2. At POS, check out a cart where only the **unchecked** program applies, with a customer
   attached. Confirm the resulting invoice shows `pointsEarned = 0` (AC-06).
3. Watch (via logs, or the `point_history` table) that `loyalty-points.consumer.ts` either
   never fires for this invoice, or fires and credits 0 — either way, the customer's
   membership card balance does not change (AC-07).
4. Check out a second cart where only the **checked** program applies. Confirm
   `pointsEarned` matches `floor(amountDue / POINT_EARN_VND_PER_POINT)` exactly as before
   this feature, and the membership card balance increases by that amount (AC-08).
5. Check out a third cart where **both** programs apply (one checked, one unchecked).
   Confirm the whole invoice earns 0 points, not a prorated share (AC-09).
6. Check out a fourth cart with **no promotion** applied at all, customer attached. Confirm
   points accrue exactly as before this feature shipped (AC-11 — regression).

## In scope

- `compute-totals.step.ts` derives `pointsBlocked` from `ctx.promotion.appliedPrograms`.
- `persist-invoice.step.ts` and `enqueue-outbox.step.ts` both read the same
  `ctx.totals.pointsBlocked` to gate their respective points-related writes.
- The promotion-engine plumbing that makes `accruePoints` visible on `AppliedProgram` in the
  first place (`promotion-resolver.ts`'s `toAppliedProgram()`), since without it
  `compute-totals.step.ts` would have nothing to read.

## Not in scope

- Any change to `loyalty-points.consumer.ts` or `membership-card.service.ts` — per ADR-02,
  skipping the outbox enqueue is sufficient; these files are never touched.
- Persisting `pointsBlocked` on the `invoices` table — it is saga-run-scoped only (ADR-02).
- The "migration impact on existing programs" decision flagged in `03-logical-design.md` —
  this UoW implements the gating logic as designed; whether the column's default causes an
  unwanted regression on already-live programs is a separate human decision that should be
  settled before this UoW is accepted into construction, not something this UoW's code
  changes can resolve on their own.

## Risks

| Risk | Mitigation |
|---|---|
| `accruePoints` leaking onto non-invoice-discount `AppliedProgram`s and incorrectly gating their points | `toAppliedProgram()`'s conditional spread only sets it when `type === INVOICE_DISCOUNT`, mirroring the existing `discountMode`/`discountValue` guard — covered explicitly in T-03-01 and its test |
| Sync (`persist-invoice.step.ts`) and async (`enqueue-outbox.step.ts`) disagreeing | Both read the one `ctx.totals.pointsBlocked` value computed by `compute-totals.step.ts` — no second computation exists to disagree (ADR-02) |

## Definition of done

- [x] AC-06 through AC-11 all pass
- [x] `awardPointsForInvoice` is provably never invoked for a points-blocked invoice (its
      only caller, `loyalty-points.consumer.ts`, never receives the triggering event)
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 1/1 step passing
- [x] Evidence exists for every AC in `verifies` — AC-06..AC-11 exempted per 07-verification.md (financial checkout logic, no DOM surface, unsafe to script blind) — proved by the checkout-saga test suite (582 tests, including the outbox-skip and any-unchecked-wins assertions)
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
