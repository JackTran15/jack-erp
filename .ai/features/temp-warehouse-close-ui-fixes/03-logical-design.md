# Logical design — temp-warehouse-close-ui-fixes

## Approach

Two independent, minimal frontend-only fixes in `apps/pos-web`. No API, entity,
or contract changes — both defects are presentational/state-default bugs.

1. **Scroll (AC-01, AC-02):** `FastStockTransferPage.tsx`'s root div uses a
   fixed `flex h-screen flex-col` (100vh) while rendering as a plain flex
   child inside `PosLayout`'s `flex h-[100dvh] flex-col overflow-hidden` shell,
   below a sticky header. The page therefore claims a full extra viewport of
   height beneath the header, and the resulting overflow is clipped by
   `PosLayout`'s `overflow-hidden` instead of being scrollable — so
   `FastStockTransferTable`'s own `overflow-auto` wrapper never gets the real
   remaining height, and the bottom of the list (including the last row) sits
   in the clipped-off region. Fix: swap the root div's height class from
   `h-screen` to the fill-remaining-space pattern already used by
   `DailyReportPage.tsx` (`flex min-h-0 flex-1 flex-col overflow-hidden`).
2. **Default close mode (AC-03, AC-04):**
   `FastStockTransferDiscrepancyDialog.tsx` initializes `closeMode` state to
   `TempWarehouseCloseMode.NET_OFFSET`. Fix: initialize it to
   `TempWarehouseCloseMode.NONE` instead. `NONE` is unconditionally present in
   `CLOSE_MODE_OPTIONS` (never filtered by `netOffsetEligible`), so no
   eligibility guard is needed for the new default, and the existing
   `netOffsetEligible` reset effect (lines 65–72) is untouched.

## Alternatives rejected

| Option | Why not |
|---|---|
| Give `FastStockTransferTable`'s wrapper an explicit `calc(100vh - Npx)` height instead of fixing the page root | Hardcodes the header height as a magic number; breaks the moment `PosLayout`'s header grows (e.g. the optional `InvoiceTabBar` row), and diverges from the `min-h-0 flex-1` pattern the rest of the app already uses |
| Add `overflow-y: auto` directly on `PosLayout`'s root div | Lets the whole page — including the sticky header — scroll instead of just the table body, and would regress every other route that currently relies on `PosLayout` clipping cleanly |
| Reset `closeMode` via a `useEffect` keyed on `open`, so the default is re-applied every time the dialog reopens | Declined by the human (see A-03 in `01-assumptions.md`) — only the *initial* default was requested, not reset-on-every-open |
| Conditionally unmount `FastStockTransferDiscrepancyDialog` (`{open && <...>}`) so `useState` re-initializes on every open | Changes the dialog's mount lifecycle app-wide for this component; larger blast radius than needed to satisfy AC-03, and risks affecting effect/animation timing elsewhere in the dialog |

## Error taxonomy

N/A — both fixes are presentational/state-default changes with no new API
calls, no new failure modes, and no change to existing error/cancel handling
(`PosErrorDialog`, dialog `onClose`/`onCancel`) in either surface.

## ADRs

### ADR-01 — Fix the scroll clip at the page root, not the table or the layout shell
**Context:** `FastStockTransferPage` overflows `PosLayout`'s available height
by roughly the sticky header's height, and `PosLayout`'s `overflow-hidden`
silently clips that excess instead of exposing it as scrollable. Two sibling
routes (`ReturnGoodsPage.tsx`, `InvoiceListPage.tsx`) carry the exact same
`h-screen` root-div pattern as `FastStockTransferPage.tsx` and are likely
affected the same way (see A-02), while `CheckoutPage.tsx` and
`DailyReportPage.tsx` already use a `flex-1`/`min-h-0` fill pattern and do not
exhibit the bug.
**Decision:** Change only `FastStockTransferPage.tsx`'s root div height class
from `h-screen` to `min-h-0 flex-1` (with `overflow-hidden`), matching
`DailyReportPage.tsx`. Leave `PosLayout.tsx` and `PosDataTable.tsx` untouched.
**Consequences:** Fixes the reported "Kho tạm" page with a one-line class
change and zero shared-component risk. `ReturnGoodsPage.tsx` and
`InvoiceListPage.tsx` keep their latent copy of the same bug — flagged as A-02,
explicitly out of scope for backlog item #28, and worth a follow-up ticket.
**Status:** accepted
