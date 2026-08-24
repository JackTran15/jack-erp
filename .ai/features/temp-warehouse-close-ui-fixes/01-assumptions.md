---
feature: temp-warehouse-close-ui-fixes
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Root cause of "can't scroll to last row" is `FastStockTransferPage.tsx`'s root `<div className="flex h-screen ...">` (100vh) rendering as a plain flex child inside `PosLayout`'s `flex h-[100dvh] ... overflow-hidden` shell, below a sticky header — the page claims a full extra viewport height beneath the header, and the resulting overflow is clipped by `PosLayout`'s `overflow-hidden` instead of being scrollable. Sibling pages `CheckoutPage.tsx` (`flex flex-1 overflow-hidden`) and `DailyReportPage.tsx` (`flex min-h-0 flex-1 ...`) use the correct fill pattern instead of a fixed height. | high | no | Low — nothing is built yet; a wrong diagnosis just costs a second pass at G2, no shipped-code rework. | pending | — |
| A-02 | `ReturnGoodsPage.tsx` and `InvoiceListPage.tsx` copy the exact same `flex h-screen flex-col` root-div pattern as `FastStockTransferPage.tsx` and likely have the identical scroll-clipping defect, but backlog item #28 only reports "Kho tạm" — fixing those two pages is out of scope here (see 00-intent.md § Out of scope). | high | no | None — informational; does not change this feature's implementation. | pending | — |
| A-03 | `FastStockTransferDiscrepancyDialog` stays mounted for the whole page session (`open` is a boolean prop, not conditional JSX), so its `closeMode` state only initializes once, on first mount. The requested default-value fix changes only that initial value; if a user later picks a different option, cancels, and reopens the dialog in the same session, their last choice is still remembered — same as today for every option. | high | no | Small — would need a reset-on-open `useEffect` if wrong, contained to this one component. | confirmed | Confirmed by Akenzy, 2026-08-24 — "first open only", not reset-on-every-open. |
