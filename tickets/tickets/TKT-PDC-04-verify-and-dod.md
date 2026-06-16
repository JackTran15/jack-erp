# TKT-PDC-04 Verify + DoD gate (manual checkout + settlement spec)

## Epic

[EPIC-16062026 POS partial debt checkout](../epics/EPIC-16062026-pos-partial-debt-checkout.md)

## Summary

Prove the partial-debt fix end-to-end and close the epic. Because `pos-web` has no wired test runner (the `test` script is `echo test`; `checkoutValidation.test.ts` imports `vitest` but vitest is not installed), verification is: tsc typecheck + ad-hoc run of the new vitest specs + a manual checkout reproducing the screenshot against the running API, asserting the backend posts `PARTIAL_DEBT`.

## Deliverables

- No production code. Verification + sign-off only.
- Optional (flagged): add `vitest` devDependency + `"test": "vitest run"` to `apps/pos-web/package.json` so the new specs (TKT-PDC-01/02) and the existing `checkoutValidation.test.ts` actually run. Out of scope unless approved at Step 3.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/pos-web build` passes (tsc + vite build) with all four edited files.
- [ ] New specs pass via `pnpm --filter @erp/pos-web exec vitest run` (or `npx vitest run` from `apps/pos-web`): `checkoutSettlement.test.ts`, `invoicePayloadMapper.test.ts`, and the existing `checkoutValidation.test.ts` still green.
- [ ] **Manual checkout (screenshot repro):** sale total 1.500.000, deposit 50.000, cash 145.000, tick "Tính vào công nợ":
  - "Tính vào công nợ" row shows **1.305.000**.
  - Network: checkout POST body = `{ payments: [{ paymentMethod: "cash", amount: 145000, paymentAccountId }] }`.
  - API response invoice `status === "partial_debt"`; `invoice_debts` row `remainingAmount === 1305000`, `paidAmount === 0`, `originalAmount === 1305000`.
  - Receipt prints cash 145.000 paid + customer debt 1.305.000.
- [ ] **Full-debt regression:** same sale, cash cleared to 0, tick debt → row = 1.450.000, body `{ payments: [] }`, status `debt`, `invoice_debts.remainingAmount === 1450000`.
- [ ] **Paid regression:** debt unticked, cash auto-filled to 1.450.000 → status `paid`, no `invoice_debts` row.

## Definition of Done

- [ ] All acceptance criteria above checked, with the actual network body + DB/response values captured (not assumed).
- [ ] No backend file changed across the epic; `git diff --stat` shows only `apps/pos-web/**` + `tickets/**`.
- [ ] `openapi.snapshot.json` and `packages/api-client/**` unchanged.
- [ ] No Vietnamese added to any backend source (epic is FE-only, so none expected).
- [ ] No TODO/FIXME left in the touched files.

## Testing Strategy

1. Run `make dev-api` + `make dev-pos`, seed a customer + items (`pnpm seed:inventory`).
2. Build the cart, set deposit + cash, tick debt, confirm — inspect the checkout request in devtools and the response status.
3. Query `invoice_debts` (Adminer :18088 or psql) for the new invoice to confirm `remaining_amount = 1305000`.
4. Repeat for the two regressions (full debt, paid).
5. Reuse the `/verify` skill for a scripted run if helpful.

## Dependencies

- Depends on: TKT-PDC-01, TKT-PDC-02, TKT-PDC-03.
- Blocks: none (epic close).
