---
feature: hide-deposit-order-features
slug: hide-deposit-order-features
owner: Akenzy
created: 2026-08-17
status: draft
---

# Intent — hide-deposit-order-features

## Problem

The POS checkout screen (`apps/pos-web`) currently exposes two controls to cashiers that
the business wants hidden: "Đặt cọc" (a clickable row that opens a deposit-amount dialog)
and "Đặt hàng" (a preorder checkbox). Cashiers should no longer be able to see or reach
either control, without the code being deleted outright.

**Not to be confused with:** the unrelated "Deposit Fund" / "Tiền gửi" treasury
subsystem (`apps/api/src/modules/accounting/deposit/*`, the "TIỀN GỬI" nav section in
`apps/backoffice-web/src/components/layout/navConfig.ts:214-254`, permissions like
`accounting.deposit_recon.read`). That is a full bank/cash-fund accounting module —
a different, much larger feature that shares only the English word "deposit" with this
one. It is untouched by this work.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| POS cashier | Sees an "Đặt cọc" row in the payment summary panel; tapping it opens `DepositDialog` to enter a deposit amount | Does not see the "Đặt cọc" row; there is nothing to tap in its place |
| POS cashier | Sees an "Đặt hàng" checkbox in the checkout actions row (sale tab only) and can toggle it | Does not see the "Đặt hàng" checkbox |
| Developer (future) | — | Can restore both controls by flipping a single hardcoded constant back to `true`, with no other code changes |

## Success signal

Neither control is reachable or visible in the POS checkout UI when a hardcoded flag is
`false` (the default after this change): the "Đặt cọc" row does not render in the payment
summary panel and clicking where it used to sit opens no dialog; the "Đặt hàng" checkbox
does not render in the checkout actions row. Flipping that one flag back to `true`
restores both controls exactly as they behave today, with a single-file edit and no
other code changes required.

## Out of scope

- **`depositAmount` column on `InvoiceEntity`** (`apps/api/src/modules/pos/entities/invoice.entity.ts:100-101`)
  and every checkout step that re-persists an invoice's existing value
  (`checkout-invoice.service.ts:146,151,260`, `compute-totals.step.ts:48,76,148`,
  `clamp-points.step.ts:48,51`, `checkout-return.service.ts:539,645`,
  `invoice-amount.util.ts:14,19`, `persist-invoice.step.ts:62`) — this backend column
  and its plumbing are a pre-existing, separate concern; they only ever read/rewrite an
  invoice's already-stored deposit value and never received input from the UI control
  being hidden here (no checkout DTO has ever carried a `deposit` field). Hiding the UI
  entry point does not require changing any of this.
- **Checkout request DTOs** (`apps/api/src/modules/pos/checkout-saga/interface/dto/checkout-v2.dto.ts`,
  `apps/api/src/modules/pos/dto/checkout-invoice.dto.ts`) — neither has a `deposit`/`depositAmount`
  field today; none is being added.
- **The accounting/Deposit-Fund module** (`apps/api/src/modules/accounting/deposit/*` and
  its backoffice nav/permissions) — a different feature entirely, as stated above. Not
  touched by any ticket in this feature.
- **The "Đơn hàng" POS menu tile** (`apps/pos-web/src/constants/pos-menu.constant.ts:32-37`) —
  a different string ("Đơn hàng" = order-list noun) from "Đặt hàng" (the preorder
  checkbox verb being hidden here). It has no `route`, is not a working page, and is not
  touched.
- **backoffice-web** — has no equivalent "Đặt cọc"/"Đặt hàng" controls to hide; confirmed
  zero matches in `navConfig.ts` (618 lines checked). No backoffice-web change is in scope.

## Constraints

| Kind | Detail |
|---|---|
| Platform | POS-web only (`apps/pos-web`); no backend/API change, no database migration |
| Approach | Already decided by the human: wrap both entry points behind one hardcoded boolean constant (default `false`); do not delete the underlying components, and do not build a real feature-flag or permission system (pos-web has none today) |
| Reversibility | Restoring both controls must be a one-file edit (the constant), not a multi-file revert |

## Existing surface touched

- Reused/gated components (unchanged internals, gated at the entry point):
  `apps/pos-web/src/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/PaymentSummaryBlock.tsx:129-144`
  (renders the "Đặt cọc" row, opens `DepositDialog.tsx` titled "Đặt cọc" at line 30)
- `.../PaymentSummaryPanel.tsx:147-159,185,192-198` — the `onDepositClick` wiring that
  connects the row to the dialog
- `.../CheckoutActionsSection/PrintAndOrderRow/PrintAndOrderRow.tsx:51-60` — renders the
  "Đặt hàng" checkbox (sale tab only; already conditionally absent on the
  return/exchange tab via `isReturnExchange`)
- A new small constants file to hold the single hardcoded flag (exact path decided at
  logical design, out of scope for this document)
- Adjacent, unmodified: `checkoutDraft.ts:30`, `checkout.interface.ts:193` (where the
  `deposit`/`preorder` fields live in the payment draft state — values remain, only the
  UI entry points that set them are gated)
