---
feature: hide-deposit-order-features
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | The correct hide mechanism is a single hardcoded boolean constant (default `false`), not deletion of the components and not a real feature-flag/permission system | high | yes | Would change the whole shape of the implementation — deleted code vs. flag-gated code vs. new infra | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |
| A-02 | Once the "Đặt cọc" UI entry point is hidden, the settlement-math references to `deposit` (`checkoutSettlement.ts:82,106`, `settlementBase = grandTotal - deposit + returnFee`) and the receipt-printing references (`checkoutReceiptFactory.ts:62,202`, `renderInvoiceHtml.ts:447`) need no code change — they should become pure no-ops because `deposit` will always be `0`/unset with no way for a cashier to enter otherwise | low | no | If wrong, settlement totals or printed receipts could silently diverge from pre-change behaviour for some edge case not yet identified | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
