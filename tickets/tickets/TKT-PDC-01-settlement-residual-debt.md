# TKT-PDC-01 Settlement: debtAmount = residual after tendered payments (sale)

## Epic

[EPIC-16062026 POS partial debt checkout](../epics/EPIC-16062026-pos-partial-debt-checkout.md)

## Summary

Fix the displayed "Tính vào công nợ" value. Today `derivePaymentDisplay` returns `debtAmount = settlementAbs` (the full balance) whenever `debt` is on, ignoring the cash/transfer lines. For a sale it must return the **residual** the customer still owes after what they paid now: `max(0, settlementAbs − totalPaid)` — which is exactly the `rawUnder` the function already computes. The refund branch is left unchanged (out of scope).

## Deliverables

- `apps/pos-web/src/lib/page-libs/checkout/checkoutSettlement.ts` — in `derivePaymentDisplay`, the `if (input.debt)` branch returns `debtAmount: isRefund ? settlementAbs : rawUnder` (sale → residual; refund → unchanged). `changeAmount`/`shortageAmount` stay 0.
- `apps/pos-web/src/lib/page-libs/checkout/checkoutSettlement.test.ts` (new) — vitest spec (matches the existing `checkoutValidation.test.ts` style) for `deriveSettlement` / `derivePaymentDisplay`.

No other file. The display row (`DebtCheckRow.tsx`) already renders `debtAmount` verbatim — no component change needed.

## Acceptance Criteria

- [ ] Sale + debt + `totalPaid = 145.000`, `settlementAbs = 1.450.000` → `debtAmount = 1.305.000`.
- [ ] Sale + debt + `totalPaid = 0` → `debtAmount = 1.450.000` (full debt preserved).
- [ ] Sale + debt + `totalPaid ≥ settlementAbs` → `debtAmount = 0`.
- [ ] Refund (`settlementGrandTotal < 0`) + debt → `debtAmount` unchanged from current behaviour (`settlementAbs`).
- [ ] `changeAmount` and `shortageAmount` remain 0 in the debt branch.
- [ ] `deriveSettlement` propagates the new `debtAmount` (no change needed to its body — it already delegates to `derivePaymentDisplay`).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc typecheck) passes.
- [ ] New spec covers: residual sale, full debt (paid 0), overpaid (debt 0), refund unchanged.
- [ ] No backend file touched; no `openapi:generate`; `openapi.snapshot.json` unchanged.
- [ ] No new index.ts; named exports only; `@/`-style imports (per pos-web CLAUDE.md).
- [ ] No TODO/FIXME outside the plan.

## Tech Approach

```ts
// checkoutSettlement.ts — derivePaymentDisplay, debt branch
const isRefund = input.grandTotal < 0;
const settlementAbs = settlementAbsFromGrand(input.grandTotal);
const { rawOver, rawUnder } = rawPaymentDeltas(input.totalPaid, settlementAbs);

if (input.debt) {
  return {
    changeAmount: 0,
    shortageAmount: 0,
    // Sale: only the unpaid remainder becomes customer debt. Refund-debt unchanged.
    debtAmount: isRefund ? settlementAbs : rawUnder,
  };
}
```

`deriveSettlement` is untouched: it already calls `derivePaymentDisplay({ grandTotal: settlementGrandTotal, totalPaid, ... })`, so passing `settlementGrandTotal` (post-deposit/discount) as `grandTotal` keeps `rawUnder = max(0, settlementAbs − totalPaid)` correct.

> Note: this ticket fixes the **displayed** number only. Posting the correct debt requires TKT-PDC-02 (payload). Ship both together — display alone would show 1.305.000 while the backend still books 1.450.000.

## Testing Strategy

Unit (`checkoutSettlement.test.ts`, vitest, no DB) — call `deriveSettlement({ grandTotal, deposit, paymentLines, keepChange:false, debt:true })`:

1. **Residual sale (core):** `grandTotal 1.500.000, deposit 50.000, paymentLines [{amount:145.000}]` → `debtAmount === 1.305.000`, `settlementGrandTotal === 1.450.000`.
2. **Full debt:** same totals, `paymentLines []` (or `[{amount:0}]`) → `debtAmount === 1.450.000`.
3. **Overpaid:** `paymentLines [{amount:1.450.000}]` → `debtAmount === 0`.
4. **Refund unchanged:** negative `grandTotal`, `debt:true` → `debtAmount === settlementAbs`.

> Running the spec needs vitest, which `pos-web` references (`checkoutValidation.test.ts`) but does not install. See TKT-PDC-04 for the run strategy (`npx vitest run` ad hoc and/or wiring it).

## Dependencies

- Depends on: none.
- Blocks: TKT-PDC-03 (receipt parity), TKT-PDC-04 (verify). Co-ships with TKT-PDC-02.
