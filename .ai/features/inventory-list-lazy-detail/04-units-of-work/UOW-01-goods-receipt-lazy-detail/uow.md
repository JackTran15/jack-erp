---
id: UOW-01
slug: goods-receipt-lazy-detail
title: Goods Receipt list stops carrying lines; opening a document fetches lines lazily
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03, US-04]
verifies: [AC-01, AC-04, AC-07, AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: revert the 5 tickets' commits; the new `GET /:id/lines` endpoint is additive so reverting it alone (keeping the list trim) is also safe if only the FE tickets need to roll back
---

# UOW-01 — Goods Receipt lazy detail

## Demo script
1. Open the backoffice, go to Kho hàng → Phiếu nhập (Goods Receipt list).
2. Open DevTools Network tab. Load the list / turn a page — confirm the
   `/v2/goods-receipts/search` response's `data[]` rows have no `lines` field.
3. Click a row (or its document-number link). Confirm a `GET /goods-receipts/:id` request fires and
   the detail panel's header (doc number, date, counterparty, status, total) renders immediately.
4. Open a receipt with 200+ lines (seed one if needed). Confirm only the first page of lines renders
   in the detail panel, then scroll near the bottom — confirm the next page loads and appends without
   re-fetching the first page, via `GET /goods-receipts/:id/lines?page=2&pageSize=...` in the Network
   tab.
5. Open a receipt with only 1-3 lines. Confirm all lines show after the first fetch, no further
   `/lines` request fires, and the panel does not show a stuck "loading more" state.
6. Use the "In tem mã" (barcode-scan) toolbar action on a selected receipt. Confirm it still correctly
   builds the barcode print list from that receipt's full line set.
7. Confirm `GET /goods-receipts/:id/print-payload` and `GET /goods-receipts/:id/export` (print/export
   buttons) still work unchanged — they still return the full line set in one shot.

## In scope
- Trim `SearchGoodsReceiptsV2Handler` to stop selecting `lines`/`lines.item`/`lines.location`.
- Add `GET /goods-receipts/:id/lines?page=&pageSize=` (paginated, existence/scope-checked, additive).
- Frontend `PurchaseOrdersPage.tsx`: row click fetches `GET /:id` instead of reading the (now
  lines-less) list row; barcode toolbar reads from that fetch; `DetailPanel` line table switches to
  `useInfiniteQuery` against the new endpoint.
- Regression tests for the trimmed search handler and the new endpoint.

## Not in scope
- `GET /goods-receipts/:id` itself — stays eager-loaded, unchanged (see ADR-01 in
  `03-logical-design.md`). `getPrintPayload`/`export` are not touched by this UoW.
- Goods Issue, Transfer Order (UOW-02, UOW-03) — independent, disjoint files.
- Changing the outer list's pagination style (stays page-number based, per A-01).

## Risks
| Risk | Mitigation |
|---|---|
| Frontend regression: barcode toolbar or detail panel silently rendering stale/empty lines after the list trim | T-01-03/T-01-04's Done-when include an explicit manual check against a receipt with a non-trivial line count; UoW-level Demo script step 6-7 exercises both paths |
| New `/:id/lines` endpoint accidentally reuses `findOrFail` and re-triggers the entity's eager `lines` load, defeating its own purpose | T-01-02's Done-when requires confirming the existence check uses `loadEagerRelations: false` (or an equivalent lean query), not the shared `findOrFail` |

## Definition of done
- [~] AC-01, AC-04, AC-07, AC-08, AC-09, AC-10 all pass per the Demo script — verified by code +
      automated tests; live browser click-through not run this session, deferred to G4 demo
- [x] `search-goods-receipts-v2.handler.ts`'s generated SQL/relations no longer include `lines`
- [x] `GET /goods-receipts/:id/print-payload` and `:id/export` behave exactly as before (no code change, verified by existing tests still passing)
- [x] `pnpm --filter @erp/api test` green (272 suites, 2691 passed); `pnpm --filter @erp/backoffice-web build` green
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 6/6 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-01/07/09 exempted per 07-verification.md (JSON payload shape / no 200+-line seed data / barcode-print risk) — see that file's "Not verified here"
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
