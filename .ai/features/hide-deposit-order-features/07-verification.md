---
feature: hide-deposit-order-features
environments: [local-pos]
viewports: [desktop]
---

# Verification — hide-deposit-order-features

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Sale-mode payment panel has no "Đặt cọc" row | `/` | — | AC-01, AC-02 | no-text=Đặt cọc |
| S2 | Sale-mode checkout actions row has no "Đặt hàng" checkbox | `/` | — | AC-03 | no-text=Đặt hàng |

## Not verified here

- **AC-04** (return/exchange mode is unaffected) requires entering `CheckoutVariantEnum`
  `QUICK_EXCHANGE`/`INVOICE_RETURN` mode, which is reached only via an invoice-lookup flow
  against seeded invoice data (`isReturnExchange = variant !== SALE`, set by
  `checkout-session.store.ts` — not a simple always-visible tab). Scripting that reliably would
  depend on specific invoice fixtures existing in the seeded DB, which this feature's scope does
  not control. Covered instead by construction: `PrintAndOrderRow.tsx`'s gate is
  `isReturnExchange || !SHOW_DEPOSIT_ORDER_CONTROLS ? null : (...)` — the checkbox was already
  unconditionally hidden on that path before this feature (`isReturnExchange` alone was `true`),
  so the OR does not change that branch's outcome, confirmed by construction (T-01-02).
- **AC-05** (flipping the flag restores both controls) requires rebuilding the app with a
  different constant value mid-run, which a single browser session cannot do — verified instead
  by construction (T-01-01/T-01-02: both gates read the same `SHOW_DEPOSIT_ORDER_CONTROLS`
  import) and by the `uow.md` Definition of done's static/boolean trace.
- **AC-06** (settlement math) and **AC-07** (printed receipt) assert exact computed values
  (`settlementBase = grandTotal + returnFee`, deposit line omitted) that depend on live cart
  contents — a screenshot can confirm a label's absence but not arithmetic correctness. Covered
  instead by `checkoutSettlement.test.ts` and `checkoutReceiptFactory.test.ts` (T-01-03, 12/12
  passing).

## Notes

Login lands on the checkout (sale) screen by default (`landing: /` in `.ai/aidlc.yaml`), so S1
and S2 need no navigation and no cart contents — the payment panel (and both hidden controls'
former locations) render regardless of cart state.
