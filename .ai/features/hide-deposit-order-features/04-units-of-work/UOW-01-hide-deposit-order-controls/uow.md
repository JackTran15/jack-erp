---
id: UOW-01
slug: hide-deposit-order-controls
title: Đặt cọc/Đặt hàng hidden from POS checkout
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-03, US-04]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: low
status: todo
rollback: flip `SHOW_DEPOSIT_ORDER_CONTROLS` in `apps/pos-web/src/constants/feature-flags.constant.ts` back to `true` — single-file edit, no other change required
---

# UOW-01 — Đặt cọc/Đặt hàng hidden from POS checkout

## Demo script

1. With `SHOW_DEPOSIT_ORDER_CONTROLS = false` (the shipped default), open the POS checkout
   screen in dev (`make dev-pos`, add items to cart on the sale tab).
2. Confirm no "Đặt cọc" row/button renders anywhere in the payment summary panel, and there
   is nothing to click where it used to sit.
3. Confirm no "Đặt hàng" checkbox renders in the checkout actions row (sale tab).
4. Switch to the return/exchange tab and confirm the checkout actions row renders exactly as
   before (the checkbox was already absent there, independent of the flag) — regression check
   for AC-04.
5. Run a sale with no deposit entered and confirm the printed receipt and on-screen totals are
   unchanged from current production behaviour (no "Đặt cọc" line, correct grand total).
6. Locally flip `SHOW_DEPOSIT_ORDER_CONTROLS` to `true`, rebuild, and confirm both controls
   render and behave exactly as they do today (dialog opens on click, checkbox toggles) —
   confirms AC-05 with a diff touching only the one constant file.

## In scope

- One new constant, `SHOW_DEPOSIT_ORDER_CONTROLS`, in a new
  `apps/pos-web/src/constants/feature-flags.constant.ts`.
- Gating the "Đặt cọc" row render in `PaymentSummaryBlock.tsx`.
- Gating the "Đặt hàng" checkbox render in `PrintAndOrderRow.tsx`.
- Regression coverage confirming settlement math (`checkoutSettlement.ts`) and receipt
  printing (`checkoutReceiptFactory.ts`) are unaffected.

## Not in scope

- Deleting `DepositDialog.tsx`, the `onDepositClick` wiring in `PaymentSummaryPanel.tsx`, or
  the checkbox markup in `PrintAndOrderRow.tsx` — kept in place, unreachable, per ADR-01.
- Any backend/API change — no checkout DTO carries a `deposit`/`preorder` field today.
- backoffice-web — has no equivalent controls (confirmed zero matches in `navConfig.ts`).
- The accounting Deposit-Fund module and the "Đơn hàng" POS menu tile — unrelated, share only
  a word, out of scope per `00-intent.md`.

## Risks

| Risk | Mitigation |
|---|---|
| Hiding the row differently from hiding its click-handler could leave a dead click target or leave AC-01 unsatisfied | T-01-01 gates the entire `PosSummaryRow` block, not just the `onDepositClick` branch — confirmed in `03-logical-design.md` |
| A-02 (settlement/receipt behaviour at `deposit === 0`) was still `pending` at G1 | Resolved during G2 design review by reading the actual comparisons — `deposit` is a required `number` (never optional/undefined) throughout the chain, and `checkoutReceiptFactory.ts:244` already uses a `> 0` guard, not `=== 0`. T-01-03 adds regression tests to lock this in; see `03-logical-design.md`'s "A-02 investigation" section |

## Definition of done

- [x] All of AC-01..07 pass — AC-01..05 verified by static/boolean trace on the shipped code
      (see T-01-01/T-01-02 "Done when" notes); AC-06..07 verified by real passing vitest
      cases in T-01-03 (12/12 new+existing assertions green)
- [x] Neither control renders with the flag off; both render and function identically to
      today with the flag on (verified locally) — verified by static trace + boolean algebra
      on the shipped ternaries, not a live dev-server browser session; a live click-through
      of both flag states is left for the G4 demo (see T-01-01/T-01-02 tickets for the exact
      reasoning per control)
- [x] Settlement math and printed receipts are unchanged for no-deposit sales — locked in by
      T-01-03's passing regression tests (`checkoutSettlement.test.ts`,
      `checkoutReceiptFactory.test.ts`)
- [x] Restoring both controls is a single-file diff (the constant) — both gates
      (`PaymentSummaryBlock.tsx`, `PrintAndOrderRow.tsx`) read the same
      `SHOW_DEPOSIT_ORDER_CONTROLS` import; flipping it to `true` in
      `feature-flags.constant.ts` is the only edit needed, confirmed by construction
- [x] The profile's definition-of-done checklist passes — `profile: none` in `.ai/aidlc.yaml`
      (core-only ruleset, no stack-specific profile checklist); core checks run: `tsc --noEmit`
      clean and full pos-web `npx vitest run` green (8 files / 78 tests) after all 3 tickets
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-pos, 2/2 steps passing
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — AC-01/02/03 via screenshot; AC-04/05/06/07 exempted per `07-verification.md`'s "Not verified here" (no UI surface / requires rebuild / arithmetic precision better proved by unit test)
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
