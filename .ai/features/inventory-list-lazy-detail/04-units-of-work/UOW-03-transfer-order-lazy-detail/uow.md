---
id: UOW-03
slug: transfer-order-lazy-detail
title: Transfer Order list stops carrying lines; opening a document fetches lines lazily
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03, US-04]
verifies: [AC-03, AC-06, AC-07, AC-08, AC-10]
risk: high
status: todo
rollback: revert the 5 tickets' commits; T-03-01's `loadEagerRelations: false` is a single option on one existing call, trivially revertible on its own if the rest needs to stay
---

# UOW-03 — Transfer Order lazy detail

## Demo script
1. Open the backoffice, go to Kho hàng → Phiếu điều chuyển (Transfer Order list).
2. Open DevTools Network tab. Load the list / turn a page — confirm the
   `GET /inventory/transfer-orders` response's `data[]` rows have no `lines` field.
3. Click a row (or its document-number link). Confirm a `GET /inventory/transfer-orders/:id` request
   fires and the detail panel's header renders immediately.
4. Open a transfer order with 200+ lines (seed one if needed). Confirm only the first page of lines
   renders, then scroll near the bottom — confirm the next page loads and appends via
   `GET /inventory/transfer-orders/:id/lines?page=2&pageSize=...`.
5. Open a transfer order with only 1-3 lines. Confirm all lines show after the first fetch, no further
   `/lines` request, no stuck "loading more" state.
6. Confirm `GET /inventory/transfer-orders/:id/print-payload` and `:id/export` still work unchanged.
7. Edit a posted transfer order's requested quantities (the flow that internally calls
   `goodsReceiptService.getById`/`goodsIssueService.getById` via `applyDeltaToLines`) — confirm it
   still applies deltas correctly. This is the highest-risk regression this UoW touches.
8. Confirm `getByCode`, `listIssuable`, `listImportable` (other `TransferOrderEntity` list/lookup
   methods) still behave as before — none of them were touched, but they share the entity whose
   `eager: true` flag is at the center of this UoW's risk.

## In scope
- Bypass `TransferOrderEntity.lines`'s `eager: true` in `TransferOrderService.list()` specifically
  (`loadEagerRelations: false`), without touching the entity flag or any other caller.
- Add `GET /inventory/transfer-orders/:id/lines?page=&pageSize=` (paginated, existence/scope-checked,
  additive).
- Frontend `TransferOrdersPage.tsx`: row click fetches `GET /:id` instead of reading the (now
  lines-less) list row; `DetailPanel` line table switches to `useInfiniteQuery` against the new
  endpoint. (No barcode-scan toolbar action exists on this page — AC-09 does not apply here.)
- Regression tests, with explicit verification that every other `TransferOrderEntity` `find*()` caller
  (`findOrFail`/`getById`, `getByCode`, `listIssuable`, `listImportable`,
  `applyDeltaToLines`'s cross-service `getById` calls) is unaffected.

## Not in scope
- `GET /inventory/transfer-orders/:id` itself — stays eager-loaded, unchanged (ADR-01).
  `getPrintPayload` and `applyDeltaToLines`'s cross-service `getById` calls into
  `goodsReceiptService`/`goodsIssueService` are not touched by this UoW.
- Removing `TransferOrderEntity.lines`/`TransferOrderLineEntity.item`'s `eager: true` flags themselves
  — explicitly out of scope per `00-intent.md`.
- Goods Receipt, Goods Issue (UOW-01, UOW-02) — independent, disjoint files.
- Changing the outer list's pagination style (stays page-number based, per A-01).

## Risks
| Risk | Mitigation |
|---|---|
| `loadEagerRelations: false` on `list()`'s `findAndCount()` accidentally also strips something callers other than `lines` rely on (e.g. via a shared query object) | T-03-01's Done-when requires confirming `list()`'s `where`/`skip`/`take`/`order` are byte-for-byte unchanged — only the new option is added |
| Any other `TransferOrderEntity` `find*()` caller (`findOrFail`, `getByCode`, `listIssuable`, `listImportable`) silently starts skipping eager `lines` too, if the fix is applied at the wrong scope (e.g. a shared query builder helper instead of `list()`'s own call) | T-03-01's Done-when explicitly re-runs and reads the existing tests for `findOrFail`/`getById`/`getByCode`/`listIssuable`/`listImportable` to confirm each still returns eager `lines`/`item` |
| `applyDeltaToLines`'s cross-service dependency on `goodsReceiptService.getById`/`goodsIssueService.getById` (owned by UOW-01/UOW-02, not this UoW) regresses if either of those UoWs' `GET :id` scope decision changes later | Documented in `03-logical-design.md` ADR-01 as a cross-UoW invariant; T-03-05 re-runs `transfer-order.service.spec.ts`'s `applyDeltaToLines` tests as part of this UoW's own regression pass too |

## Definition of done
- [~] AC-03, AC-06, AC-07, AC-08, AC-10 all pass per the Demo script — verified by code + automated
      tests; live browser click-through not run this session, deferred to G4 demo
- [x] `TransferOrderService.list()` no longer triggers the entity's eager `lines`/`item` load
      (`loadEagerRelations: false`, asserted by test)
- [x] `findOrFail`, `getById`, `getByCode`, `listIssuable`, `listImportable`, and
      `applyDeltaToLines`'s cross-service calls all still receive eager-loaded `lines`/`item` unchanged
      — all 43 pre-existing `transfer-order.service.spec.ts` tests pass unmodified
- [x] `pnpm --filter @erp/api test` green (272 suites, 2715 passed); `pnpm --filter @erp/backoffice-web build` green
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 6/6 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-03/07 exempted per 07-verification.md (JSON payload shape / no 200+-line seed data) — see that file's "Not verified here"
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
