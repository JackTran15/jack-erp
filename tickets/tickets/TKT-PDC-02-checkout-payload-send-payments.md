# TKT-PDC-02 Checkout payload: send real payment lines when debt is on

## Epic

[EPIC-16062026 POS partial debt checkout](../epics/EPIC-16062026-pos-partial-debt-checkout.md)

## Summary

Make the checkout actually post the tendered cash when "Tính vào công nợ" is ticked. Today `buildCheckoutInvoiceApiPayload` short-circuits to `{ payments: [] }` when `debt === true`, so the backend never sees the cash and books the full balance as receivable. Remove the short-circuit and map the active payment lines exactly as in the non-debt path. The backend then records the payments and auto-books only the remainder as `PARTIAL_DEBT` (`checkout-invoice.service.ts:180-228`). Debt with no tendered cash still produces `payments: []` → full `DEBT` (preserved).

## Deliverables

- `apps/pos-web/src/lib/page-libs/checkout/invoicePayloadMapper.ts` — delete the `if (input.debt) return { ok: true, body: { payments: [] } };` block; let the existing active-lines mapping run for both debt and non-debt. Drop `debt` from `BuildCheckoutInvoiceApiPayloadInput` (now unused) and update its doc comment.
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-actions.ts` — update the one caller of `buildCheckoutInvoiceApiPayload` to stop passing `debt` (call becomes `buildCheckoutInvoiceApiPayload({ paymentLines: p.paymentLines })`).
- `apps/pos-web/src/lib/page-libs/checkout/invoicePayloadMapper.test.ts` (new, vitest) — payload mapping spec.

No DTO/interface change — `CheckoutInvoiceBody`/`InvoicePaymentLineBody` already carry payment lines.

## Acceptance Criteria

- [ ] Debt + cash line 145.000 (with `paymentAccountId`) → body `{ payments: [{ paymentMethod, amount: 145.000, paymentAccountId }] }`.
- [ ] Debt + no cash / all amounts 0 → `{ payments: [] }` (full debt preserved).
- [ ] Debt + cash line missing `paymentAccountId` → `{ ok: false, error: { code: "missing_payment_account" } }` (same guard as non-debt; cash can't post without an account).
- [ ] Non-debt behaviour is byte-for-byte unchanged.
- [ ] No reference to `input.debt` remains in `buildCheckoutInvoiceApiPayload`; the caller no longer passes it; tsc is clean.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc typecheck) passes — including the updated caller.
- [ ] New spec covers: debt+cash, debt+no-cash, debt+missing-account, non-debt regression.
- [ ] No backend file touched; no `openapi:generate`; `openapi.snapshot.json` unchanged.
- [ ] No new index.ts; named exports only.
- [ ] No TODO/FIXME outside the plan.

## Tech Approach

```ts
// invoicePayloadMapper.ts
interface BuildCheckoutInvoiceApiPayloadInput {
  paymentLines: PaymentLine[];
  // `debt` removed — payload is now derived purely from the tendered lines;
  // empty/zero lines naturally yield payments:[] (full debt), which the backend
  // books as receivable. Partial cash → PARTIAL_DEBT, computed server-side.
}

export function buildCheckoutInvoiceApiPayload(
  input: BuildCheckoutInvoiceApiPayloadInput,
):
  | { ok: true; body: CheckoutInvoiceBody }
  | { ok: false; error: ResolveCheckoutPayloadError } {
  const activeLines = input.paymentLines.filter((line) => line.amount > 0);
  const payments: InvoicePaymentLineBody[] = [];
  for (const line of activeLines) {
    if (!line.paymentAccountId) {
      return { ok: false, error: { code: "missing_payment_account" } };
    }
    payments.push({
      paymentMethod: PAYMENT_METHOD_TO_API_METHOD[line.method],
      amount: line.amount,
      paymentAccountId: line.paymentAccountId,
    });
  }
  return { ok: true, body: { payments } };
}
```

Caller (`use-checkout-actions.ts`, ~line 198): `buildCheckoutInvoiceApiPayload({ paymentLines: p.paymentLines })` — drop the `debt: p.debt` field. Verify no other caller passes `debt`.

> Backend confirmation (no change needed): `checkout-invoice.service.ts` computes `remainder = amountDue − totalPaid`; `remainder > 0 && totalPaid > 0 → PARTIAL_DEBT` + `invoiceDebtService.createFromInvoice(saved, remainder)`; `totalPaid > amountDue → 400`. The FE `validateCheckout` already permits debt + underpayment via `debtCovered`, so no FE validation change is needed.

## Testing Strategy

Unit (`invoicePayloadMapper.test.ts`, vitest):

1. **Debt + partial cash:** one CASH line `{ amount: 145.000, paymentAccountId: "acc" }` → `ok`, `body.payments.length === 1`, `amount === 145.000`.
2. **Debt + no cash:** lines `[]` or `[{ amount: 0 }]` → `ok`, `body.payments === []`.
3. **Missing account:** line `{ amount: 145.000, paymentAccountId: null }` → `ok:false`, `error.code === "missing_payment_account"`.
4. **Split tender:** two lines >0, both with accounts → both mapped, order preserved.

## Dependencies

- Depends on: none (independent of TKT-PDC-01).
- Blocks: TKT-PDC-03, TKT-PDC-04. Co-ships with TKT-PDC-01 (display + posting must match).
