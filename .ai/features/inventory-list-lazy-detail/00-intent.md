---
feature: inventory-list-lazy-detail
slug: inventory-list-lazy-detail
owner: Akenzy
created: 2026-08-17
status: draft
---

# Intent — Inventory List Lazy Detail

## Problem

Backoffice's three warehouse list pages under "Kho hàng" — Goods Receipt (Phiếu nhập), Goods
Issue (Phiếu Xuất), and Transfer Order (Phiếu điều chuyển) — fetch full line-item and
related-entity detail (item, location, provider, …) for every row on every list load and page
turn, even though the list view only renders header/summary columns (doc number, date,
counterparty, status, total). Query cost and response payload size scale with the total number
of lines across the documents on that page, not with the number of documents on it — a
warehouse document can carry hundreds of lines, so every list load and page-turn gets more
expensive the more lines the underlying documents have, with no matching benefit, because the
fetched line detail is never rendered in the list itself.

Concretely, today:
- Goods Receipt search handler (`apps/api/src/modules/inventory/goods-receipt/queries/search-goods-receipts-v2.handler.ts:47-55`)
  `leftJoinAndSelect`s `gr.provider`, `gr.location`, `gr.lines`, `lines.item`, `lines.location`
  on every list query.
- Goods Issue search handler (`apps/api/src/modules/inventory/goods-issue/queries/search-goods-issues-v2.handler.ts:53-66`)
  does the same for `gi.lines`, `lines.item`, `lines.location`, plus `provider`, `reasonRef`,
  `location`.
- Transfer Order has no v2 search endpoint at all; its `list()`
  (`apps/api/src/modules/inventory/transfer-order/transfer-order.service.ts:451-472`) calls
  `toRepo.findAndCount()`, which still returns full lines+item because
  `TransferOrderEntity.lines` is declared `eager: true`
  (`transfer-order.entity.ts:97-101`) and `TransferOrderLineEntity.item` is also `eager: true`
  (`transfer-order-line.entity.ts:53`) — every Repository `find*()` call against this entity
  auto-loads them regardless of need.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Warehouse / backoffice staff browsing Kho hàng lists | Every list page load or page-turn pays the query/payload cost of every line on every document on that page, even though only header columns are shown | List loads and page-turns cost the same regardless of how many lines the underlying documents have; line detail is fetched only when a document is opened |

## Success signal

For a page of N documents, none of the three list endpoints selects or returns line-level
(`lines`) data as part of the list/search response — verified by diffing each search handler's
relations/generated SQL and each list response DTO's shape before vs. after:
- Goods Receipt: `search-goods-receipts-v2.handler.ts` drops the `gr.lines` / `lines.item` /
  `lines.location` joins from the list query path.
- Goods Issue: `search-goods-issues-v2.handler.ts` drops the `gi.lines` / `lines.item` /
  `lines.location` joins from the list query path.
- Transfer Order: the list query path (`transfer-order.service.ts` `list()`) is rewritten so it
  no longer triggers the entity-level `eager: true` lines/item load, while `getById` /
  `findOrFail` (`transfer-order.service.ts:1718-1725`) and any other caller of `find*()`
  continue to eager-load lines unchanged.

## Out of scope

- Removing `TransferOrderEntity.lines` / `TransferOrderLineEntity.item`'s `eager: true` flags
  themselves — other callers (e.g. `getById`, `findOrFail`) depend on the eager load; only the
  list query path changes to a form that doesn't trigger it.
- Building a general-purpose v2 search endpoint for Transfer Order — only the minimum needed to
  drop eager lines from the list query specifically.
- Changing the outer list's pagination style — it stays page-number based
  (`DEFAULT_PAGINATION`, `components/table/pagination.dto.ts:98-104`); infinite scroll applies
  only to the line items inside the detail view, per the confirmed decision recorded as A-01 in
  `01-assumptions.md`.
- Any cash-receipt ("Phiếu Thu") voucher list — this feature's "Phiếu Xuất" scope is Goods
  Issue; see A-03 in `01-assumptions.md` for the open naming sanity-check.

## Constraints

| Kind | Detail |
|---|---|
| Data model | `TransferOrderEntity.lines` (`transfer-order.entity.ts:97-101`) and `TransferOrderLineEntity.item` (`transfer-order-line.entity.ts:53`) are `eager: true`, which fires on any Repository `find*()`/`findAndCount()` call but NOT on an explicit QueryBuilder — the list query must be rewritten as a QueryBuilder (or equivalent) to legitimately skip the eager preload without touching the entity-level flag or any other caller. |
| Pattern precedent | No `useInfiniteQuery` / infinite-scroll pattern exists anywhere in the repo. The closest precedent is the scroll-triggered "load more" pattern in `apps/backoffice-web/src/components/forms/LookupField.tsx` (search contract 30-53, state 152-161, `loadMore()` 113/392-402, auto-fill-if-not-full effect 248-259) — not TanStack Query, not a full-table pattern, but the only "load on scroll" style reference in the codebase. |
| Regression surface | Code that reads `row.lines` directly off the already-fetched list response today — barcode-scan toolbar actions on `PurchaseOrdersPage.tsx:459` and `GoodsIssuePage.tsx:414`; each page's `DetailPanel` (`PurchaseOrdersPage.tsx:818,878-936`, `GoodsIssuePage.tsx:766-801`, `TransferOrdersPage.tsx:612-660`) — must be rewired to a fresh detail fetch once list rows stop carrying `lines`. |
| Existing detail routes | `GET /:id` already exists for all three entities (`goods-receipt.controller.ts:81-89`, `goods-issue.controller.ts:221`, `transfer-order.controller.ts:405-412`) and is a candidate to extend or wrap, rather than building new detail endpoints from scratch. |

## Existing surface touched

- List pages: `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx`,
  `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx`,
  `apps/backoffice-web/src/pages/transfer-orders/TransferOrdersPage.tsx`
- Backend search handlers: `search-goods-receipts-v2.handler.ts`,
  `search-goods-issues-v2.handler.ts`, and `transfer-order.service.ts` `list()`
- Detail rendering: each page's `DetailPanel` component
- Regression call sites: the barcode-scan toolbar actions on the Goods Receipt and Goods Issue
  pages
- Existing detail-by-id controllers/services: `goods-receipt.controller.ts`,
  `goods-issue.controller.ts`, `transfer-order.controller.ts` (likely need an added
  paginated-lines capability — exact shape left to G2, see A-02 in `01-assumptions.md`)
