---
feature: promotion-points-reverse-defects
stories: 5
acceptance_criteria: 14
---

# Requirements — Points reverse & balance snapshot defects

Throughout: **blocked invoice** means an invoice whose checkout applied at least one
promotion program with `accrue_points = false`, so `pointsBlocked` was true and
`invoice.points_earned = 0`. **Accruing invoice** means the ordinary case,
`points_earned = floor(amount_due / 10 000)`.

## US-01 — The receipt shows the balance the card actually holds

As a customer buying on a no-accrual promotion, I want the receipt to show my real point
balance so that I am not told I have points that were never credited.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Blocked invoice, the reported case
```gherkin
Given a customer whose card holds 7575 points
And a promotion program with "Tích điểm cho khách hàng" unchecked
When a checkout of 800000đ completes with that program applied
Then the invoice has points_earned = 0
And the invoice has points_balance_after = 7575
And the printed receipt and the invoice-review dialog both show 7.575
```

**AC-02** — Accruing invoice, unchanged
```gherkin
Given a customer whose card holds 100 points
And no applied program blocks accrual
When a checkout completes that redeems 20 points and earns 73
Then the invoice has points_balance_after = 153
```

**AC-03** — Walk-in, unchanged
```gherkin
Given a checkout with no customer attached
When it completes
Then points_balance_after is null
And no membership card is read
```

## US-02 — Cancelling a blocked invoice takes no points

As a customer, I want cancelling my invoice to claw back only the points it actually
earned, so that a cancellation cannot leave me poorer than before the sale.

**Priority:** must
**Depends on:** US-01 (same scenario, one step later)

### Acceptance criteria

**AC-04** — Blocked invoice, the reported case
```gherkin
Given the invoice from AC-01 with points_earned = 0
When it is cancelled
Then the customer's card still holds 7575 points
And no point_history row with delta < 0 exists for that invoice
And the invoice has points_reversed = 0
```

**AC-05** — Accruing invoice, unchanged
```gherkin
Given an accruing invoice of 800000đ with points_earned = 80
When it is cancelled
Then exactly 80 points are decremented from the card
And a point_history row of -80 is written for that invoice
```

**AC-06** — Redeemed points still come back
```gherkin
Given a blocked invoice that redeemed 100 points
When it is cancelled
Then the 100 redeemed points are credited back
And no additional points are clawed back
And points_balance_after equals the card balance plus 100
```

## US-03 — Returning a blocked invoice takes no points

As a customer, I want returning goods to reverse only the points the original sale earned,
so that the return path cannot destroy points the cancel path now protects.

**Priority:** must
**Depends on:** US-02 (shares the payload contract)

### Acceptance criteria

**AC-07** — Full return of a blocked invoice
```gherkin
Given the invoice from AC-01 with points_earned = 0
When every line is returned
Then the return document has points_reversed = 0
And the customer's card still holds 7575 points
```

**AC-08** — Return of an accruing invoice, unchanged
```gherkin
Given an accruing invoice whose returned lines net to 464000đ
When those lines are returned
Then the reverse event still carries 464000đ worth of reversal, i.e. 46 points
And a full return of that same invoice still reverses exactly its points_earned
```

**AC-09** — QUICK return with no original invoice, unchanged
```gherkin
Given a QUICK return with no original invoice to read points_earned from
When it is posted
Then the reverse falls back to the gross money-derived behaviour it has today
```

## US-04 — The owner can see how much existing data is wrong

As the product owner, I want a count of the rows these two defects have already corrupted,
so that I can decide whether a remediation is worth writing.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Inflated snapshots counted
```gherkin
Given the erp_clone_prod database
When the assessment query runs
Then it reports how many invoices have points_balance_after inconsistent with
     points_earned, points_redeemed and the card's history
And it lists them by organization and branch
```

**AC-11** — Destroyed points counted
```gherkin
Given the same database
When the assessment query runs
Then it reports every point_history row with delta < 0 written against an invoice whose
     points_earned = 0
And it reports the total number of points destroyed that way
```

**AC-12** — A recommendation, not just numbers
```gherkin
Given the two counts above
When the assessment is written up
Then it states whether the affected rows are dev-test only or real customer data
And it recommends remediate or fix-forward, with the reason
And the decision itself is left to the owner
```

## US-05 — The column the return cap reads can be trusted

As the engineer shipping the return cap, I need `invoices.points_earned` to record what each
invoice actually earned, so that capping on it cannot refuse a legitimate reversal.

Added 2026-08-19 after G2 was reopened: 24 posted customer sales read 0 while the ledger
shows a real earn (A-10, `08-impact-assessment.md` Finding B).

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-13** — Every recoverable row is repaired
```gherkin
Given an invoice with points_earned = 0 whose point_history holds a positive earn
When the backfill runs
Then points_earned is set to the summed ledger earn for that invoice
And on erp_clone_prod exactly 27 rows are updated, totalling 3439 points
```

**AC-14** — Nothing else is touched
```gherkin
Given invoices whose points_earned already agrees with the ledger
And the three invoices whose column is right while the ledger is empty
When the backfill runs
Then none of those rows change
And a dry run reports the same row count as the real run applies
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Compatibility | A reverse event published before this deploy, carrying money only, is still processed correctly by the new consumer | T-02-01 |
| Compatibility | The reverse payload change does not require a schema migration (A-07) | T-02-01 |
| Regression | `pnpm --filter @erp/api test` green; no existing `subtotalDelta` expectation changes value | T-03-02 |
| Observability | When a reverse resolves to zero points on an invoice that moved money, the consumer logs why (blocked accrual) rather than silently no-opping | T-02-02 |
| Safety | The assessment in US-04 is read-only — no write, no migration, no data change | T-04-01 |
| Safety | The backfill reports what it would change before changing it, and its `down()` is exact | T-05-01 |
| Ordering | The return cap cannot reach an environment before the backfill has run there | T-05-01 |
