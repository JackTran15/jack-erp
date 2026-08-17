---
feature: promotion-scope-points-toggle
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Promotion Scope Lock & Per-Program Points Toggle

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | New invoice-discount program form shows the locked scope and the new points checkbox | `/promotions/programs/new?type=INVOICE_DISCOUNT` | — | AC-01, AC-04 | text=Tất cả hàng hóa trong hóa đơn; no-text=Chỉ hàng hóa chưa áp dụng khuyến mại; text=Tích điểm cho khách hàng |

## Not verified here

- **AC-02** (re-saving an existing `NON_PROMO_ONLY` program forces `ALL_ITEMS`) and **AC-05**
  (checkbox value persists across save+reload) both require a save → reload round trip. This
  tool's Steps table has no mechanism to capture a value from one step (e.g. the id a save
  redirects to) and feed it into a later step's path, and driving that round trip blind (guess
  a selector, submit, guess where it lands) risks a false negative more than it proves anything
  S1 doesn't already show. Both are proved instead by construction's own live E2E check against
  the running dev API (from `promotion-scope-points-toggle` construction: `POST /v2/promotions`
  with `accruePoints: true` → 201 echoing `true`, DB persisted `true`; `GET /v2/promotions/:id`
  on a backfilled pre-existing program returned `accruePoints: true`) plus
  `promotion.mapper.spec.ts` / `create-promotion.handler.spec.ts`-style unit coverage.
- **AC-03** (an untouched `NON_PROMO_ONLY` program keeps its stored value and a checkout still
  honors it) — requires a specific never-opened fixture program plus a full checkout run; proved
  by `invoice-discount.strategy.spec.ts`'s existing `NON_PROMO_ONLY` branch coverage, unchanged
  by this feature per ADR-01.
- **AC-06, AC-07, AC-08, AC-09, AC-10, AC-11** (checkout points behavior: sync `pointsEarned`, async outbox-skip,
  any-unchecked-wins, regression for checked/no-promotion cases) — all backend/financial-logic
  claims about `invoice.pointsEarned` and whether a `LOYALTY_POINTS_AWARD` event was enqueued,
  none of it DOM-observable. Scripting a full POS checkout (search product, add to cart, apply a
  specific promotion, complete payment) is also well past this tool's 3-action-per-step
  interaction model — it would be several steps of blind selector-guessing for a financial flow,
  which is a worse risk than not scripting it. Proved instead by the checkout-saga test suite
  from construction (582 tests across `promotion checkout-saga`, including a targeted assertion
  that the outbox `enqueue` mock is never called with the loyalty-award topic when
  `pointsBlocked` is true, and a separate case proving unrelated events still fire).

## Notes

Confirmed live (not assumed): navigating directly to
`/promotions/programs/new?type=INVOICE_DISCOUNT` (bypassing the "Thêm mới" dropdown menu, which
did not visibly expose its items to scripted interaction) lands on a working form — the "PHẠM VI
ÁP DỤNG" section shows only the fixed text, no radio group, and "Tích điểm cho khách hàng" renders
as an unchecked checkbox directly below it. This is real, current-build evidence for the two
highest-value, purely-additive claims (AC-01, AC-04); everything requiring a save/reload or a
completed checkout is covered by construction's own tests instead, per the reasoning above.
