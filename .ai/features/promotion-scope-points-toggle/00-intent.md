---
feature: promotion-scope-points-toggle
slug: promotion-scope-points-toggle
owner: Akenzy
created: 2026-08-17
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Promotion Scope Lock & Per-Program Points Toggle

Two independent, small changes to the invoice-discount promotion program, bundled because
they touch the same form and the same checkout path:

- **Part A — lock "Phạm vi áp dụng".** The invoice-discount promotion form already offers an
  editable two-option radio for scope; the business wants it locked, not invented.
- **Part B — "Tích điểm cho khách hàng".** A brand-new per-program opt-out for loyalty-points
  accrual; nothing like it exists in the codebase today.

## Problem

**Part A.** `ApplyScopePromotionSection.tsx:10-24` renders a `RadioGroup` under the heading
"Phạm vi áp dụng", backed by `APPLY_SCOPE_OPTIONS` in `program-form.constants.ts:62-65`
(`ApplyScope.NON_PROMO_ONLY` — default on a new form — vs `ApplyScope.ALL_ITEMS`). This
section renders only inside `PromotionInvoiceDiscount.tsx:41` — none of
`PromotionProductDiscount.tsx`, `PromotionTieredDiscount.tsx`, `PromotionBuyGet.tsx`, or
`PromotionGift.tsx` render it. The engine currently branches on the stored value at
`invoice-discount.strategy.ts:37-38`: `NON_PROMO_ONLY` restricts a program to
`state.unclaimedLines(cart)`, `ALL_ITEMS` applies it to `cart.lines`. The business wants the
choice removed — the form should no longer let an admin pick; it should always behave as
`ALL_ITEMS` going forward.

**Part B.** Points accrual today has no awareness of promotions at all:
- Sync path: `compute-totals.step.ts:83` computes `pointsEarned = Math.floor(amountDue /
  POINT_EARN_VND_PER_POINT)`. `amountDue` already reflects any promotion discount
  (`promotionDiscount = ctx.promotion?.promotionDiscount ?? 0`, lines 45-46), but nothing
  checks whether accruing points is even allowed given the promotion that was applied.
  `persist-invoice.step.ts:71` gates only on `invoice.customerId` being set.
- Async path: `enqueue-outbox.step.ts:143-167` enqueues a `LOYALTY_POINTS_AWARD` event
  whenever `invoice.customerId` is set, carrying `subtotal: totals.amountDue`.
  `loyalty-points.consumer.ts:21-53` → `MembershipCardService.awardPointsForInvoice`
  (`membership-card.service.ts:124-152`) independently **re-derives** points from
  `invoice.subtotal` — it does not reuse whatever the sync step computed.
- Because the same "should this invoice earn points" decision would need to be evaluated
  twice, in two places that do not currently share state, a naive implementation risks the
  two paths disagreeing (sync writes a nonzero `pointsEarned`, async awards points anyway,
  or vice versa). Deciding once at checkout time and persisting the outcome for the async
  consumer to read, versus re-deriving independently in both places, is the central open
  question of this feature (see A-04 in `01-assumptions.md`).
- `.ai/features/pos-promotion-apply/00-intent.md`'s "Out of scope" section confirms this gap
  was known and deliberately deferred when that feature shipped: "Điểm tích lũy / hạng thẻ
  ... `pointsRedeemed` đã có đường đi riêng ở `finalizeCheckoutAndPrint`, không đụng."

The business wants a per-program checkbox, "Tích điểm cho khách hàng", default OFF, on the
promotion program form. If an invoice has multiple promotion programs applied and ANY of
them has the checkbox unchecked, the entire invoice earns zero points — not prorated.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Promotion admin (backoffice) | Chooses between two "Phạm vi áp dụng" options when creating/editing an invoice-discount program | No longer offered the choice; the program always applies to all items on the invoice |
| Promotion admin (backoffice) | Has no way to say a given promotion program should not earn the customer loyalty points | Ticks/unticks "Tích điểm cho khách hàng" per program; unchecked by default |
| Cashier / customer at POS | Points accrue on every invoice with a customer attached, regardless of which promotion (if any) applied | Points accrue only when every promotion program applied to the invoice has "Tích điểm cho khách hàng" checked; otherwise the invoice earns zero points |

## Success signal

Two independently verifiable outcomes:

1. Creating or editing an invoice-discount promotion program no longer shows an editable
   scope radio — it is fixed to `ALL_ITEMS`. For any program created or edited after this
   ships, the `NON_PROMO_ONLY` branch of `invoice-discount.strategy.ts:37-38` is never
   reached again.
2. A checkout that applies a promotion program with the new checkbox unchecked results in
   `invoice.pointsEarned === 0` — and that zero agrees on BOTH the sync `compute-totals.step`
   value and whatever the async `LOYALTY_POINTS_AWARD` → `MembershipCardService` path ends up
   crediting, with zero drift between the two.

## Out of scope

- The unrelated `CalcBasis.NOT_DISCOUNTED` ("Hàng hóa chưa khuyến mại") field on the
  promotion CONDITION entity (`program-form.constants.ts:67-71`,
  `packages/shared-interfaces/src/promotion/index.ts:77-81`, used in
  `condition-evaluator.ts:31`) — a different field on a different entity ("Điều kiện áp
  dụng" / calc basis for a "total ≥ X" condition), not touched by this feature.
- The four other promotion-type variants that never render `ApplyScopePromotionSection`
  today (`PromotionProductDiscount`, `PromotionTieredDiscount`, `PromotionBuyGet`,
  `PromotionGift`) — Part A (scope lock) applies only to the invoice-discount variant, since
  it is the only one that currently has a scope choice to lock.
- Retroactively migrating already-saved invoice-discount programs whose stored
  `invoice_scope` is `NON_PROMO_ONLY` — left as-is; only the form stops offering the choice
  for new/edited programs. See A-03.
- Deciding the persistence design for the points-eligibility decision (new flag on the
  `invoices` row written once at checkout vs. independent re-derivation in the async
  consumer) — this is a G2-level design decision, not resolved here. See A-04.
- Deciding whether the "Tích điểm cho khách hàng" checkbox is invoice-discount-only or
  should appear on all five promotion-type variants — flagged as an open question, not
  decided here. See A-05.

## Constraints

| Kind | Detail |
|---|---|
| Data | A new column is needed on the promotion program (or equivalent) to persist the points-eligibility flag — `synchronize: false` everywhere, so this requires a TypeORM migration |
| Consistency | The "does this invoice earn points" decision must agree between the sync `compute-totals.step.ts` path and the async `membership-card.service.ts` path — no drift between the two |
| Backward compat | Existing saved invoice-discount programs with `invoice_scope = NON_PROMO_ONLY` keep working exactly as today (the engine still honours the stored value); only the FORM stops offering the choice going forward |

## Existing surface touched

- Frontend: `ApplyScopePromotionSection.tsx`, `program-form.constants.ts`,
  `program-form.types.ts`, `promotion.mapper.ts`
- Backend: `promotion-program.entity.ts` (new column), `create-promotion.dto.ts`,
  `invoice-discount.strategy.ts`
- Checkout saga: `compute-totals.step.ts`, `persist-invoice.step.ts`,
  `enqueue-outbox.step.ts`
- Loyalty: `loyalty-points.consumer.ts`, `membership-card.service.ts`
- Adjacent features (context only, not modified by this feature): `pos-promotion-apply`
  (explicitly deferred loyalty points as out of scope when it shipped),
  `promotion-programs-engine`, `promotion-qa-defects`
