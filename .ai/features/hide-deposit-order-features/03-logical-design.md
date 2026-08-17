---
feature: hide-deposit-order-features
adr_count: 1
---

# Logical design — hide-deposit-order-features

## Approach

Add one exported boolean constant in a new pos-web constants file,
`apps/pos-web/src/constants/feature-flags.constant.ts`:

```ts
export const SHOW_DEPOSIT_ORDER_CONTROLS = false;
```

This follows the existing pos-web constants convention (1 file per concern, UPPER_SNAKE_CASE
value, named export, no default export, no `index.ts` re-export) — see sibling files
`apps/pos-web/src/constants/pos-menu.constant.ts` and `common.constant.ts`. No existing file
is a fit for a cross-cutting flag: `common.constant.ts` today holds only date-range filter
choices, and every other constants file is scoped to one page/domain.

Import the constant at exactly two render sites and gate on it:

1. `PaymentSummaryBlock.tsx:129-144` — wrap the entire `PosSummaryRow` that renders the
   "Đặt cọc" label/button in `{SHOW_DEPOSIT_ORDER_CONTROLS ? (...) : null}`. Today that row
   always renders (as a button when `onDepositClick` is passed, as plain text otherwise) —
   gating must hide the row itself, not just its clickability, to satisfy AC-01 ("I do not
   see an 'Đặt cọc' row or button anywhere"). No other file needs to change:
   `PaymentSummaryPanel.tsx`'s `onDepositClick` wiring (`handleOpenDepositDialog`,
   `depositDialogOpen` state, the `<DepositDialog>` element at lines 147-159, 185, 192-198)
   and `DepositDialog.tsx` itself stay exactly as they are — they become unreachable dead
   code paths purely because their only entry point (the row) no longer renders. This is the
   intended shape of a hide, not a gap: reversing the flag brings the whole chain back with
   zero additional edits.
2. `PrintAndOrderRow.tsx:51-60` — wrap the existing `{isReturnExchange ? null : (...)}`
   checkbox block's inner branch with the same constant, e.g.
   `{isReturnExchange || !SHOW_DEPOSIT_ORDER_CONTROLS ? null : (...)}`. The pre-existing
   `isReturnExchange` gate (checkbox already absent on the return/exchange tab, independent
   of this feature) must keep working unchanged — AC-04 is a regression check on that
   existing behaviour, not a new rule.

Both gates read the same constant, so restoring both controls is a single-line, single-file
edit (`SHOW_DEPOSIT_ORDER_CONTROLS = true`), satisfying AC-05.

## Alternatives rejected

| Option | Why not |
|---|---|
| Delete `PaymentSummaryBlock`'s deposit row, `DepositDialog`, and `PrintAndOrderRow`'s checkbox outright | Rejected by human decision (A-01): reversibility matters more than diff size for this change — deletion would turn "bring it back" into a multi-file revert instead of a one-line flip |
| Build a real feature-flag or permission system (env var, remote config, RBAC permission key) | Out of proportion — pos-web has no such mechanism today (confirmed: no flag infra anywhere in `apps/pos-web/src`), and this feature gates exactly two controls behind one binary switch. Building general infra for a two-control hide is speculative scope the request never asked for |

## Domain model

N/A — no new entity, no persisted state. `SHOW_DEPOSIT_ORDER_CONTROLS` is a compile-time
constant, not a stored value.

## Contracts

N/A — no backend/API change. No checkout DTO carries a `deposit`/`preorder` field today
(confirmed in `00-intent.md`'s Out of scope section), and this feature does not add one.
`GET/POST` surfaces are untouched.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `SHOW_DEPOSIT_ORDER_CONTROLS` | `feature-flags.constant.ts` module scope | Build-time constant, not runtime state |
| `deposit` (payment draft field) | existing `usePosCheckoutSessionStore` / `checkoutDraft.ts` (`payment.deposit`, default `0`) | Unchanged by this feature — the field remains, only its one UI entry point is hidden |
| `preorder` (payment draft field) | same store, `payment.preorder`, default `false` | Unchanged — same reasoning |

## Error taxonomy

N/A — a hidden UI control has no new failure mode. No network call, no validation, no new
error state is introduced or removed.

## A-02 investigation — resolved during design review

A-02 asked whether `checkoutSettlement.ts` or the receipt-printing chain treat `deposit === 0`
differently from `deposit === undefined`. Traced end to end:

- `checkoutDraft.ts:32` initializes `payment.deposit: 0` — every draft always has a concrete
  `number`, never `undefined`. `CheckoutPaymentDraft.deposit` (`checkout.interface.ts:195`) is
  typed as a required `number`, not optional.
- `checkoutSettlement.ts:82,106` — `deriveSettlement({ deposit, ... })` takes `deposit` as a
  required `number` and computes `settlementBase = grandTotal - deposit + returnFee`. With
  `deposit = 0` (the only value reachable once the control is hidden) this reduces to
  `grandTotal + returnFee`, exactly matching pre-change behaviour (AC-06). The existing test
  suite (`checkoutSettlement.test.ts:12,50`) already exercises `deposit: 0` and
  `deposit: 50_000` through the same code path with no branching on `deposit`'s presence —
  there is no `=== 0` vs. `=== undefined` distinction anywhere in this function because the
  parameter is never optional.
- `checkoutReceiptFactory.ts:244` — `depositAmount: deposit > 0 ? deposit : undefined`. This
  is a `> 0` comparison, not `=== 0`/`!== undefined`: any non-positive `deposit` (including
  exactly `0`) already collapses to `undefined` in the output payload today, before this
  feature exists. Hiding the control cannot change this — it only guarantees `deposit` stays
  at its default `0` forever, which was already one of the two inputs this line treats
  identically.
- `renderInvoiceHtml.ts:36-47,447` — `amountRow(label, amount)` checks `amount == null` (loose
  equality, matches both `null` and `undefined`) and renders nothing otherwise. Since
  `depositAmount` reaching this function is only ever a positive number or `undefined` (never
  `0`, per the guard above), the "Đặt cọc" receipt line was already omitted for every
  no-deposit sale before this feature, and continues to be.

**Conclusion: A-02's hypothesis holds. No code change is needed in `checkoutSettlement.ts` or
the receipt-printing chain — settlement math and printed receipts are pure no-ops for this
feature, confirmed by reading the actual comparisons rather than assumed.** UOW-01's test
ticket (T-01-03) adds regression coverage that locks this in, rather than any defensive code
change.

## Cache & offline

N/A — no data fetching, no cache layer involved.

## Observability

N/A — no new event, metric, or log. A hidden UI control is not a business event worth
tracking, and none of the existing telemetry (if any) fires from these two render sites.

## ADRs

### ADR-01 — Hide via a single hardcoded boolean constant, not deletion or a new flag system

**Context:** The business wants two POS checkout controls ("Đặt cọc" row, "Đặt hàng"
checkbox) to stop being visible/reachable by cashiers, while keeping the ability to bring
them back cheaply if that decision reverses. pos-web has no existing feature-flag,
permission, or remote-config mechanism.

**Decision:** Introduce one exported `const SHOW_DEPOSIT_ORDER_CONTROLS = false` in a new
`apps/pos-web/src/constants/feature-flags.constant.ts`, and gate the two render sites on it.
Do not delete the underlying components (`DepositDialog.tsx`, the checkbox markup, the
`onDepositClick` wiring); do not build a generic flag/permission system.

**Consequences:**
- Restoring both controls is a one-line, one-file edit (`false` → `true`), matching AC-05.
- The dead-but-present code (`DepositDialog.tsx`, `onDepositClick` chain) stays in the
  codebase unexercised until the flag flips back — acceptable because it was explicitly
  chosen over deletion (A-01) for reversibility.
- No new abstraction (no flag-evaluation service, no per-org/per-branch toggle) is
  introduced; if a real feature-flag system is ever needed for other features, this constant
  does not preempt or constrain that design — it is a plain, local, single-purpose switch.

**Status:** accepted
