---
feature: hide-deposit-order-features
stories: 4
acceptance_criteria: 7
---

# Requirements — hide-deposit-order-features

## US-01 — Cashier no longer sees "Đặt cọc"

As a POS cashier, I want the "Đặt cọc" row to be gone from the payment summary panel
so that I cannot start a deposit entry.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Row not rendered
```gherkin
Given the hide-deposit-order flag is off (false, the default)
When I open the POS checkout screen
Then I do not see an "Đặt cọc" row or button anywhere in the payment summary panel
```

**AC-02** — No dialog reachable
```gherkin
Given the hide-deposit-order flag is off
When I interact with the area of the payment summary panel where the "Đặt cọc" row used to render
Then no DepositDialog opens and no deposit amount can be entered through the checkout UI
```

## US-02 — Cashier no longer sees "Đặt hàng"

As a POS cashier, I want the "Đặt hàng" checkbox to be gone from the checkout actions
row so that I cannot mark a sale as a preorder.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-03** — Checkbox not rendered on the sale tab
```gherkin
Given the hide-deposit-order flag is off
When I open the POS checkout screen on the sale tab
Then I do not see an "Đặt hàng" checkbox in the checkout actions row
```

**AC-04** — Return/exchange tab unaffected (regression)
```gherkin
Given the hide-deposit-order flag is off
When I open the POS checkout screen on the return/exchange tab
Then the checkout actions row renders exactly as it does today (the "Đặt hàng" checkbox was already absent there before this change, independent of the flag)
```

## US-03 — Hiding is reversible with a single constant

As a developer, I want to restore both hidden controls by flipping one hardcoded
constant back to `true`, with no other code changes, so the decision to hide them is
cheap to reverse.

**Priority:** must
**Depends on:** US-01, US-02

### Acceptance criteria

**AC-05** — Flip restores both controls
```gherkin
Given the hardcoded flag lives in exactly one source file, currently set to false
When a developer changes that single value to true and the POS app is rebuilt
Then the "Đặt cọc" row and the "Đặt hàng" checkbox both render again exactly as they behave today (dialog opens on click, checkbox toggles state)
And no file other than the one holding the constant was modified to achieve this
```

## US-04 — Financial output is unaffected by hiding the controls

As a POS cashier, I want invoice totals and printed receipts to compute exactly as
before once the deposit control is hidden, so that a UI-only change does not silently
alter financial output.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Settlement math unaffected
```gherkin
Given the "Đặt cọc" control is hidden and no deposit value can be entered through the checkout UI
When checkout settlement math runs (settlementBase = grandTotal - deposit + returnFee, in checkoutSettlement.ts)
Then deposit resolves to 0 for every new invoice and settlementBase equals grandTotal + returnFee, matching behaviour from before the control was hidden
```

**AC-07** — Printed receipt unaffected
```gherkin
Given the "Đặt cọc" control is hidden and no deposit value can be entered through the checkout UI
When a checkout receipt is generated (checkoutReceiptFactory.ts, renderInvoiceHtml.ts)
Then the receipt's deposit-related line renders the same as it did before the control was hidden, with no visual or numeric regression
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Regression | Settlement totals for all invoices are unchanged by this feature, since no live checkout path ever populated a non-zero deposit through the UI being hidden | AC-06 |
| Regression | Printed receipts are visually and numerically unchanged by this feature | AC-07 |
| Reversibility | Restoring both controls is a single-file edit, verified by inspecting the diff of the revert | AC-05 |
