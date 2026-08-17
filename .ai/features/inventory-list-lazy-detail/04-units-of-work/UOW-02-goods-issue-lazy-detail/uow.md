---
id: UOW-02
slug: goods-issue-lazy-detail
title: Goods Issue list stops carrying lines; opening a document fetches lines lazily
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03, US-04]
verifies: [AC-02, AC-05, AC-07, AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: revert the 5 tickets' commits; the new `GET /:id/lines` endpoint is additive so reverting it alone (keeping the list trim) is also safe if only the FE tickets need to roll back
---

# UOW-02 — Goods Issue lazy detail

## Demo script
1. Open the backoffice, go to Kho hàng → Phiếu Xuất (Goods Issue list).
2. Open DevTools Network tab. Load the list / turn a page — confirm the
   `/v2/inventory/goods-issues/search` response's `data[]` rows have no `lines` field.
3. Click a row (or its document-number link). Confirm a `GET /inventory/goods-issues/:id` request
   fires and the detail panel's header renders immediately.
4. Open an issue with 200+ lines (seed one if needed). Confirm only the first page of lines renders,
   then scroll near the bottom — confirm the next page loads and appends via
   `GET /inventory/goods-issues/:id/lines?page=2&pageSize=...`.
5. Open an issue with only 1-3 lines. Confirm all lines show after the first fetch, no further
   `/lines` request fires, no stuck "loading more" state.
6. Use the "In tem mã" (barcode-scan) toolbar action on a selected issue. Confirm it still correctly
   builds the barcode print list from that issue's full line set.
7. Confirm `GET /inventory/goods-issues/:id/print-payload` and `:id/export` still work unchanged.
8. If the issue is the export leg of a Transfer Order, confirm editing the transfer order's requested
   quantities (which calls `goodsIssueService.getById` internally) still works — this is the exact
   cross-service dependency ADR-01 in `03-logical-design.md` is protecting.

## In scope
- Trim `SearchGoodsIssuesV2Handler` to stop selecting `lines`/`lines.item`/`lines.location`.
- Add `GET /inventory/goods-issues/:id/lines?page=&pageSize=` (paginated, existence/scope-checked,
  additive).
- Frontend `GoodsIssuePage.tsx`: row click fetches `GET /:id` instead of reading the (now lines-less)
  list row; barcode toolbar reads from that fetch; `DetailPanel` line table switches to
  `useInfiniteQuery` against the new endpoint.
- Regression tests for the trimmed search handler and the new endpoint.

## Not in scope
- `GET /inventory/goods-issues/:id` itself — stays eager-loaded, unchanged (ADR-01). `getPrintPayload`
  and `TransferOrderService.applyDeltaToLines`'s cross-service call into `goodsIssueService.getById`
  (`transfer-order.service.ts:1515`) are not touched by this UoW.
- Goods Receipt, Transfer Order (UOW-01, UOW-03) — independent, disjoint files.
- Changing the outer list's pagination style (stays page-number based, per A-01).

## Risks
| Risk | Mitigation |
|---|---|
| `TransferOrderService.applyDeltaToLines` (cross-service caller of `goodsIssueService.getById`) silently breaks if the "leave GET /:id untouched" decision is violated later | T-02-02's Done-when requires the new endpoint's existence check to use `loadEagerRelations: false`, not `findOrFail`, keeping `findOrFail`/`getById` completely unmodified |
| Frontend regression: barcode toolbar or detail panel rendering stale/empty lines after the list trim | T-02-03/T-02-04's Done-when include a manual check against an issue with a non-trivial line count |

## Definition of done
- [~] AC-02, AC-05, AC-07, AC-08, AC-09, AC-10 all pass per the Demo script — verified by code +
      automated tests; live browser click-through not run this session, deferred to G4 demo
- [x] `search-goods-issues-v2.handler.ts`'s generated SQL/relations no longer include `lines`
- [x] `GET /inventory/goods-issues/:id/print-payload`, `:id/export`, and
      `TransferOrderService.applyDeltaToLines`'s use of `goodsIssueService.getById` behave exactly as
      before (no code change, verified by existing tests still passing)
- [x] `pnpm --filter @erp/api test` green (272 suites, 2702 passed); `pnpm --filter @erp/backoffice-web build` green
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 6/6 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-02/07/09 exempted per 07-verification.md (JSON payload shape / no 200+-line seed data / barcode-print risk) — see that file's "Not verified here"
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
