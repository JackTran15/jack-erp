# TKT-PDC-03 Receipt + auto-fill parity with partial debt

## Epic

[EPIC-16062026 POS partial debt checkout](../epics/EPIC-16062026-pos-partial-debt-checkout.md)

## Summary

Bring the two remaining surfaces in line with partial debt:

1. **Receipt** — `checkoutReceiptFactory` forces `effectiveTotalPaid = 0` when `debt`, so the printout shows "paid 0 / full debt" even when cash was tendered. Use the actual `totalPaid` so the receipt prints the cash paid and the residual `customerDebtIssued`.
2. **Auto-fill stability** — the first payment line auto-fills to the full balance on every total change (`PaymentSection` effect → `computeFirstLineAuto`). Once debt is on, suppress that auto-overwrite so the cashier's partial cash amount is not silently reset to the full balance on a cart edit.

## Deliverables

- `apps/pos-web/src/lib/page-libs/checkout/checkoutReceiptFactory.ts` — remove `const effectiveTotalPaid = debt ? 0 : totalPaid;`; use `totalPaid` directly for `paid`, the `payments` list, and the `deriveInvoiceTotals({ totalPaid })` call. Update/remove the stale comment block (lines ~69-71).
- `apps/pos-web/src/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSection.tsx` — guard the auto-fill effect so it only runs when `!debt`; add `debt` to the dependency array; update the comment.

No calc change here — `deriveInvoiceTotals` already returns the correct `customerDebtIssued = rawUnder` for a sale; it was only being fed `totalPaid = 0`.

## Acceptance Criteria

- [ ] Receipt with debt + cash 145.000 → `totals.paid === 145.000`, `totals.customerDebtIssued === 1.305.000`, `payments` lists the 145.000 cash line (not a single `{ amount: 0 }` placeholder).
- [ ] Receipt with debt + no cash → `paid === 0`, `customerDebtIssued === full balance` (unchanged from today).
- [ ] With debt on, changing the cart total does **not** overwrite a cashier-entered partial cash amount back to the full balance.
- [ ] With debt off, the first-line auto-fill to the full balance is unchanged (pay-in-full default preserved).
- [ ] Toggling debt off re-enables auto-fill (line refills to current balance).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc typecheck) passes.
- [ ] Receipt parity verified in the manual checkout flow (TKT-PDC-04) — provisional + final print.
- [ ] No backend file touched; no `openapi:generate`.
- [ ] No new index.ts; named exports only.
- [ ] No TODO/FIXME outside the plan.

## Tech Approach

```ts
// checkoutReceiptFactory.ts
const paid = totalPaid > 0 ? totalPaid : 0;
const payments =
  totalPaid > 0
    ? paymentLines
        .filter((l) => l.amount > 0)
        .map((l) => ({ label: resolvePaymentMethodLabel(l.method, methods), amount: l.amount }))
    : [{ label: primaryMethodLabel, amount: 0 }];

const t = deriveInvoiceTotals({ grandTotal, totalPaid, keepChange, debt });
// debt + partial cash → t.customerDebtIssued = amountDue − totalPaid (rawUnder).
```

```tsx
// PaymentSection.tsx — auto-fill effect
// First payment line tracks "Còn phải thu" only while NOT on credit. Under debt the
// cashier sets how much is collected now (the rest becomes công nợ), so don't overwrite it.
useEffect(() => {
  if (debt) return;
  setFirstLineAmountAuto(settlementAbs);
}, [debt, settlementAbs, setFirstLineAmountAuto]);
```

> Step-3 decision (see epic): this plan does **not** auto-zero the cash line when debt is ticked (pure "respect entered payments"). If the one-click full-debt variant is approved, additionally reset the first line to 0 inside `handleDebtChange` when turning debt on — that is the only extra edit and lives in `use-checkout-payment.ts`.

## Testing Strategy

- Unit (extend `checkoutReceiptFactory` coverage if a spec exists, else assert via the manual flow): debt + cash → `paid`/`customerDebtIssued` correct; debt + no cash → full debt.
- Manual (TKT-PDC-04): enter cash 145.000, tick debt, edit cart qty → confirm the cash field is not reset to the new balance; print → confirm "Đã trả 145.000 / Khách nợ 1.305.000".

## Dependencies

- Depends on: TKT-PDC-01 (residual display semantics), TKT-PDC-02 (payload posts cash).
- Blocks: TKT-PDC-04.
