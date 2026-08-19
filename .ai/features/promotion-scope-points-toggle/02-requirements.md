---
feature: promotion-scope-points-toggle
stories: 6
acceptance_criteria: 11
---

# Requirements — Promotion Scope Lock & Per-Program Points Toggle

## US-01 — Lock "Phạm vi áp dụng" to all items

As a promotion admin, I want the invoice-discount program form to stop offering a scope
choice so that every invoice-discount program consistently applies to the whole invoice.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — New program is always ALL_ITEMS
```gherkin
Given I am creating a new invoice-discount promotion program
When I open the program form
Then no "Phạm vi áp dụng" radio is shown
And the program is created with an effective scope of ALL_ITEMS
```

**AC-02** — Editing and re-saving an existing NON_PROMO_ONLY program forces ALL_ITEMS
```gherkin
Given an existing invoice-discount program was saved with invoiceScope = NON_PROMO_ONLY
When I open it in the edit form and save it again, with no scope radio available to choose
Then the saved program's effective scope becomes ALL_ITEMS
```

**AC-03** — Untouched existing programs keep their old stored value (regression)
```gherkin
Given an existing invoice-discount program was saved with invoiceScope = NON_PROMO_ONLY
And it is never opened or re-saved through the form
When a checkout evaluates promotions against it
Then the engine still honours the stored NON_PROMO_ONLY value exactly as before this feature
```

## US-02 — Add "Tích điểm cho khách hàng" checkbox

As a promotion admin, I want a per-program checkbox controlling whether the promotion
program allows loyalty-points accrual, defaulted off, so that I can opt specific promotions
out of earning points.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-04** — Default unchecked on a new program
```gherkin
Given I am creating a new promotion program
When I open the program form
Then the "Tích điểm cho khách hàng" checkbox is present and unchecked by default
```

**AC-05** — Value persists
```gherkin
Given I check "Tích điểm cho khách hàng" on a promotion program and save it
When I reload the program in the edit form
Then the checkbox still shows checked
```

## US-03 — Checkout with one unchecked program earns zero points

As the business, I want an invoice where the only applied promotion program has "Tích điểm
cho khách hàng" unchecked to earn zero loyalty points, computed the same way on both the
synchronous and asynchronous points paths.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-06** — Sync path zeroes pointsEarned
```gherkin
Given a customer is attached to the cart
And exactly one promotion program is applied at checkout, with "Tích điểm cho khách hàng" unchecked
When the checkout saga computes totals and persists the invoice
Then invoice.pointsEarned is 0
```

**AC-07** — Async path agrees (no drift)
```gherkin
Given the same checkout as AC-06 completes
When the LOYALTY_POINTS_AWARD outbox event is processed by the loyalty-points consumer
Then MembershipCardService credits 0 points to the customer's membership card
And this matches invoice.pointsEarned from AC-06 exactly — no drift between the two paths
```

## US-04 — Checkout with a checked program accrues points as today (regression)

As the business, I want an invoice where the applied promotion program has "Tích điểm cho
khách hàng" checked to keep earning points exactly as it does today.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-08** — Points accrue unchanged
```gherkin
Given a customer is attached to the cart
And exactly one promotion program is applied at checkout, with "Tích điểm cho khách hàng" checked
When the checkout saga computes totals and persists the invoice
Then invoice.pointsEarned equals floor(amountDue / POINT_EARN_VND_PER_POINT), exactly as before this feature
And the async LOYALTY_POINTS_AWARD path credits the same amount to the membership card
```

## US-05 — Any unchecked program among several zeroes the whole invoice

As the business, I want an invoice with multiple applied promotion programs, where at least
one has "Tích điểm cho khách hàng" unchecked, to earn zero points on the whole invoice — not
a partial or prorated amount.

**Priority:** must
**Depends on:** US-02, US-03

### Acceptance criteria

**AC-09** — Any-unchecked-wins
```gherkin
Given a customer is attached to the cart
And two promotion programs are applied at checkout: one with "Tích điểm cho khách hàng" checked, one unchecked
When the checkout saga computes totals and persists the invoice
Then invoice.pointsEarned is 0 for the whole invoice, not a prorated share
And the async LOYALTY_POINTS_AWARD path also credits 0 points — no drift
```

**AC-10** — All-checked accrues normally
```gherkin
Given a customer is attached to the cart
And two promotion programs are applied at checkout, both with "Tích điểm cho khách hàng" checked
When the checkout saga computes totals and persists the invoice
Then invoice.pointsEarned accrues exactly as it does today, unaffected by this feature
```

## US-06 — Checkout with no promotion applied is unaffected (regression)

As the business, I want invoices with no promotion program applied at all to keep earning
points exactly as they do today, completely unaffected by this feature.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-11** — No promotion, has customer
```gherkin
Given a customer is attached to the cart
And no promotion program is applied at checkout
When the checkout saga computes totals and persists the invoice
Then invoice.pointsEarned accrues exactly as it does today (floor(amountDue / POINT_EARN_VND_PER_POINT))
And the async LOYALTY_POINTS_AWARD path credits the same amount, unaffected by this feature
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Isolation | `PromotionProductDiscount`, `PromotionTieredDiscount`, `PromotionBuyGet`, `PromotionGift` do not start rendering the locked scope section as a side effect of this change | TBD — assigned at G3 |
| Consistency | The zero-points decision is computed once and agreed by both `compute-totals.step.ts` and the async `membership-card.service.ts` path for every AC in US-03/US-05/US-06 — no drift case may ship | TBD — assigned at G3 |
| Data integrity | The new points-eligibility column ships with a migration consistent with `synchronize: false` (per `CLAUDE.md` database rules) | TBD — assigned at G3 |
| Open scope question | Whether "Tích điểm cho khách hàng" should also render on `PromotionProductDiscount`, `PromotionTieredDiscount`, `PromotionBuyGet`, `PromotionGift` (not just invoice-discount, which is what US-02's ACs assume) is unresolved — see A-05 in `01-assumptions.md`. US-02 as written above only requires the checkbox to exist on the invoice-discount form; if A-05 resolves to "all variants", this non-functional item and US-02 both need new ACs before construction covers it | A-05 (unresolved) |
