---
feature: promotion-points-reverse-defects
slug: promotion-points-reverse-defects
owner: Akenzy
created: 2026-08-19
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Points reverse & balance snapshot defects (QA #15, #16)

Retesting `promotion-scope-points-toggle` (QA defect #10 — the per-program "Tích điểm cho
khách hàng" opt-out) surfaced two new defects, #15 and #16. This is a **bug-fix** feature:
every change must trace back to one of them, or to the third instance of the same root
cause found during discovery.

## Problem

Defect #10 made a new state possible: **an invoice that moves money but earns no points.**
Two code paths never learned about it, because both derive points from money instead of
reading the points the invoice actually recorded.

**#15 — the receipt prints a balance the customer never had.** Promotion with
`accrue_points = false`, customer holding 7.575 points, invoice 800.000đ. `points_earned = 0`
is correct and `point_history` is untouched — correct — but `points_balance_after` is written
as **7.655**, 80 points that were never accrued. Verified:
`persist-invoice.step.ts:86` adds `totals.pointsEarned` (raw), while line 73 immediately above
writes the correctly gated `invoice.pointsEarned = customerId && !pointsBlocked ? … : 0`. The
comment on lines 68-72 claims "`pointsBalanceAfter` just below has always been guarded this
way" — true of the `customerId` guard, never true of `pointsBlocked`. The printed receipt and
the invoice-review dialog both read this column
(`use-checkout-actions.ts:329`, `InvoiceReceiptDialog.tsx:102`), so the wrong number is what
the customer is handed.

**#16 — cancelling that invoice takes 80 points the customer never earned.** Cancel the
invoice from #15: `points_earned = 0`, `points_reversed = 0`, yet a `point_history` row of
**−80** is written and the card is really debited. Verified: `cancel-invoice.service.ts:168`
publishes `subtotalDelta: Number(invoice.amountDue)` and
`loyalty-points-reverse.consumer.ts:61` recomputes
`floor(|subtotalDelta| / POINT_EARN_VND_PER_POINT)` = 80. The invoice's own `pointsEarned` is
never consulted. Line 116 of the same service *does* use `pointsReversed` for the
`pointsBalanceAfter` projection — which is exactly why the snapshot and the card end up
disagreeing with each other.

**Third instance, not reported by QA, same root cause.**
`checkout-return.service.ts:1122` publishes `computeReverseBase(originalInvoice, totals)` —
also money — and line 345 derives `invoice.pointsReversed` from that same money base.
Returning a `pointsBlocked` invoice will claw back points that were never accrued, the same
way cancelling does. In scope here rather than left as a fourth QA ticket.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Customer on a no-accrual promotion | Receipt shows a balance inflated by the points the promotion withheld | Receipt shows the balance the card actually holds |
| Same customer, invoice later cancelled | Loses 80 real points that were never accrued | Card is untouched; no `point_history` row |
| Same customer, invoice later returned | Same silent loss, via the return path | Card is untouched |
| Cashier | Cannot answer "why did my points drop?" — the receipt and the card disagree | Receipt, `points_balance_after` and the card agree at every step |

## Success signal

Run the #15/#16 scenario end to end — promotion with `accrue_points = false`, customer on
7.575 points, invoice 800.000đ — and assert by number at each step:

- After checkout: `points_earned = 0` **and** `points_balance_after = 7575` (today: 7655).
  The printed receipt and the invoice-review dialog show 7.575.
- After cancelling that invoice: card still holds **7.575**, and
  `select count(*) from point_history where invoice_id = <id> and delta < 0` → **0**
  (today: one row, −80).
- After returning that invoice instead: card still holds **7.575**, `points_reversed = 0`.
- Regression, unchanged behaviour on an accruing invoice: full return of an 800.000đ invoice
  that earned 80 still reverses exactly 80; partial return still reverses its prorated share.
- `pnpm --filter @erp/api test` green.

## Out of scope

- **The v1 checkout path.** `checkout-invoice.service.ts` has no `pointsBlocked` concept at
  all — `grep pointsBlocked` hits only the v2 saga — so under v1 the `accrue_points = false`
  toggle would be ignored outright.

  **Corrected 2026-08-19, after G3:** Akenzy confirms all checkout runs through v2, so this is
  not a live defect and does not need a fix ticket. Nothing in this feature changes as a
  result — #15 is v2-only, and the cancel and return paths are not flag-dependent at all.

  It leaves a hazard rather than a bug: `invoice.service.ts:96` reads
  `import.meta.env.VITE_CHECKOUT_V2 === "true"` and the repo contains no `.env`, no
  `.env.example` in `apps/pos-web`, and no mention of the variable in `ecosystem.config.cjs`.
  The flag is set outside the repo, so any build that misses it — fresh clone, CI runner
  without the var, local dev — silently falls back to v1 and accrues points a promotion meant
  to withhold. The follow-up worth writing is therefore *flip the default or delete the v1
  path*, not *teach v1 about `pointsBlocked`*.
- **Deciding the data remediation.** Whether to repair already-written
  `points_balance_after` values and re-credit points destroyed by #16 is deferred to the
  impact assessment in this feature (UOW-04); the assessment is in scope, acting on it is a
  separate decision by the owner.
- **Re-opening #10's design.** `pointsBlocked`, `accrue_points`, and the any-unchecked-wins
  rule are settled (ADR-02 of `promotion-scope-points-toggle`) and are not revisited.
- **The earn side.** `enqueue-outbox.step.ts:143` already gates the award event on
  `!totals.pointsBlocked`; QA confirms the earn is correct. Untouched.

## Constraints

| Kind | Detail |
|---|---|
| Immutability | Posted transactions are immutable — a wrong point balance is corrected by a `point_history` ADJUST entry, never by editing a row |
| Contract | `LoyaltyPointsReversePayload` is consumed by two producers (cancel, return) and one consumer; the consumer must stay backward-tolerant of in-flight money-only events during deploy |
| Schema | `synchronize: false` — any column change is a hand-written TypeORM migration. None is expected: `pointsEarned` / `pointsReversed` already exist on `invoice.entity.ts:98` |
| Language | Backend English only (errors, comments, swagger, logs); Vietnamese only in UI strings |
| Regression | The money-derived reverse must keep its exact current numbers for accruing invoices — `checkout-return.service.spec.ts` pins `subtotalDelta` at 464.000 / 800 / 190 |

## Existing surface touched

- Reused: `POINT_EARN_VND_PER_POINT` (`loyalty.constants.ts:11`), `MembershipCardService`,
  `LoyaltyPointsReversePublisher` / `LoyaltyPointsReverseConsumer`, `pointsBlocked` on
  `CheckoutStepContext` (`checkout-step.ts:133`)
- Adjacent features: `promotion-scope-points-toggle` (introduced `pointsBlocked`),
  `cancel-invoice-refund`, `return-points-net-basis` (owns `computeReverseBase`),
  `checkout-saga`
- Entry points: no new route, no new UI. Three existing write paths and one event contract.
