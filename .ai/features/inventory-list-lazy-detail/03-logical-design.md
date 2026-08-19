---
feature: inventory-list-lazy-detail
adr_count: 2
---

# Logical design — Inventory List Lazy Detail

## Approach

Per entity (Goods Receipt, Goods Issue, Transfer Order — "Phiếu Xuất" = Goods Issue per A-03),
four moving parts:

**1. List/search endpoints stop delivering `lines`.**
- GR: `search-goods-receipts-v2.handler.ts:47-52` drops the `.leftJoinAndSelect("gr.lines", "lines")`,
  `.leftJoinAndSelect("lines.item", "lineItem")`, `.leftJoinAndSelect("lines.location", "lineLocation")`
  calls; keeps `provider`/`location`. The handler already builds the row query with an explicit
  `QueryBuilder` (`createQueryBuilder("gr")`, `search-goods-receipts-v2.handler.ts:93-94`), so
  `GoodsReceiptEntity.lines`'s `eager: true` (`goods-receipt.entity.ts:143-147`) never fires here in
  the first place — the three joins exist only because they were added by hand to keep row shape
  parity with the old `find()`-based list (see the comment at
  `search-goods-receipts-v2.handler.ts:44-46`). Removing them is a pure deletion, no new query
  technique needed.
- GI: `search-goods-issues-v2.handler.ts:53-66` — same trim, drop `gi.lines`/`lines.item`/`lines.location`
  (`:61-63`), keep `provider`/`reasonRef`/`location`/`targetBranch`. Same QueryBuilder situation as GR.
- TO: `transfer-order.service.ts:451-472` `list()` calls `this.toRepo.findAndCount({ where, skip, take,
  order })` (`:465-470`) — a `Repository` call, which (unlike a `QueryBuilder`) *does* trigger
  `TransferOrderEntity.lines`'s `eager: true` (`transfer-order.entity.ts:97-101`) and, transitively,
  `TransferOrderLineEntity.item`'s `eager: true` (`transfer-order-line.entity.ts:53-55`). Add
  `loadEagerRelations: false` to that one `findAndCount()` call (see ADR-02) — every other field of
  the call (`where`, `skip`, `take`, `order`) is untouched.

**2. `GET /:id` detail endpoints are left unchanged — they keep eager-loading full `lines`.**
This corrects a premise in the original design brief for this feature (that `GET /:id` should also
drop eager `lines`, to avoid the new sub-resource in step 3 "double-delivering" the same data).
Investigation of the actual call graph shows that premise doesn't hold:
- `getById()` is not a controller-only leaf. For all three entities it is called by
  `getPrintPayload()`, which builds the full print/export document and genuinely needs every line in
  one shot (GR: `goods-receipt.service.ts:1088-1093`; GI: `goods-issue.service.ts:724-729`; TO:
  `transfer-order.service.ts:285-290`). `GET /:id/export` (e.g. `goods-receipt.controller.ts:101-115`)
  calls `getPrintPayload`, which calls `getById`, on every export click.
- For GR and GI specifically, `getById()` is also called *cross-service* by
  `TransferOrderService.applyDeltaToLines()`'s fetcher functions
  (`transfer-order.service.ts:1487` → `goodsReceiptService.getById`, `:1515` →
  `goodsIssueService.getById`) when a transfer order's requested quantities are edited after the
  export/import leg has posted. That code reads the full `lines` array off the returned entity to
  compute per-line deltas — a paginated or lines-less result would silently corrupt that flow.
- `findOrFail()` (the private helper both `getById()` and the mutation flows share — e.g.
  `goods-receipt.service.ts:1155-1165`) is a single method with these several callers; splitting it
  into a "lean" variant for the controller and an "eager" variant for print/cross-service use would
  mean auditing every call site to assign it correctly. That is exactly the "wide blast radius across
  untraced callers" risk that `00-intent.md`'s Out of Scope section already rejected for touching
  `TransferOrderEntity.lines`'s `eager: true` flag directly — the same argument applies here, just one
  level down the call graph, and to GR/GI as much as TO.
- Crucially, **no AC requires `GET /:id` to omit `lines`.** US-01/AC-01..03 scope the "no `lines` in
  the response" requirement to the list/search endpoints only; US-02/AC-04..06 only require that
  header fields render without *waiting on* line data, which is satisfied by the frontend's render
  order (step 4), not by the response shape of `GET /:id` itself.

So `GET /:id` (`goods-receipt.controller.ts:81-89`, `goods-issue.controller.ts:221-226`,
`transfer-order.controller.ts:405-412`) is untouched by this feature. See ADR-01.

**3. New endpoint per entity: `GET /:id/lines?page=&pageSize=`.**
Follows the existing sub-resource convention already used for `GET /:id/print-payload` and
`GET /:id/export` (`goods-receipt.controller.ts:91-99`, confirmed pattern per A-02). Each handler:
1. Runs an existence + org/branch-scope check equivalent to today's `findOrFail`, but via
   `repo.findOne({ where: { id, organizationId, ... }, loadEagerRelations: false })` — cheap, and
   deliberately bypasses the entity's eager `lines` since this call only needs to know the document
   exists and belongs to the caller (see ADR-02). 404 if not found.
2. Queries the line table directly and paginated: e.g.
   `lineRepo.find({ where: { goodsReceiptId: id, organizationId }, order: { createdAt: "ASC" },
   skip: (page - 1) * pageSize, take: pageSize })`, plus a `count()` with the same `where`. This is a
   brand-new method with zero existing callers, so it carries none of step 2's blast-radius risk.
   `GoodsReceiptLineEntity.item`/`.location` (and the GI/TO equivalents) stay `eager: true`
   (`goods-receipt-line.entity.ts:65-71`, `goods-issue-line.entity.ts:37-41`,
   `transfer-order-line.entity.ts:53-55`) — untouched, and exactly the per-line detail the UI needs to
   render a row, so `repo.find()` naturally returns fully-formed line rows.
3. Response shape mirrors the existing `{ items, hasMore, total? }` contract already used by
   `LookupField`'s paginated `search` contract (`LookupField.tsx:27-32`) — the closest existing
   "load on scroll" precedent in the repo (see Contracts below for the exact shape).

**4. Frontend: row click now fetches, DetailPanel now scrolls.**
All three list pages already share one selection hook,
`useDocumentListSelection` (`apps/backoffice-web/src/components/document/useDocumentListSelection.ts`),
used by `PurchaseOrdersPage.tsx:337-340`, `GoodsIssuePage.tsx` (equivalent import), and
`TransferOrdersPage.tsx` (equivalent import). Today it derives `activeRecord`/`selectedRecord` purely
client-side — `rows.find((row) => getRowId(row) === selectedId)` (`useDocumentListSelection.ts:16-19`)
— off the already-fetched list page. Once step 1 strips `lines` from those rows, that derived record's
`.lines` becomes empty/undefined for every page. Each page (not the shared hook — see UoW independence
below) adds a `useQuery` keyed on `selectedId` that calls the *unchanged* `GET /:id` and uses its result
(header fields **and** its still-full `lines`) as the source of truth in place of the old
`activeRecord`/`selectedOrder`/`selectedIssue` value, wherever it's read today:
- `PurchaseOrdersPage.tsx:459` (barcode toolbar) and `PurchaseOrdersPage.tsx:818,878-936` (DetailPanel)
- `GoodsIssuePage.tsx:414` (barcode toolbar) and `GoodsIssuePage.tsx:766-801` (DetailPanel)
- `TransferOrdersPage.tsx:612-660` (DetailPanel)

Header fields render as soon as this query resolves (AC-04/05/06) — no waiting on the separate lines
fetch. The barcode-scan toolbar action keeps matching against the *complete* line set (it must, to
find a scanned line anywhere in the document, not just on the first page) — sourced from this same
`GET /:id` query result instead of the stale list-row object (AC-09).

The DetailPanel's line table is the one thing that switches to paginated rendering: it drops
`order.lines.map(...)` in favour of a `useInfiniteQuery` against the new `GET /:id/lines`, fetching the
next page on scroll-near-bottom, appending without re-fetching earlier pages (AC-07), and not showing a
"loading more" state once `hasMore` is `false` (AC-08). No `useInfiniteQuery` precedent exists in the
repo; the closest *UX* precedent (not the technical mechanism) is `LookupField.tsx`'s
`loadMore()`/scroll-threshold pattern (state at `LookupField.tsx:152-161`, `loadMore()` around
`:204-227`, scroll trigger `:250-259`) — TanStack Query itself is not new (91 files already depend on
it per `00-intent.md`'s constraints).

## Alternatives rejected

| Option | Why not |
|---|---|
| Also drop eager `lines` from `GET /:id` (the original framing of this problem) | `getById`/`findOrFail` are shared private methods, not controller-only leaves: `getPrintPayload` (print/export, all 3 entities) needs the full line set in one shot, and `TransferOrderService.applyDeltaToLines` calls `goodsReceiptService.getById`/`goodsIssueService.getById` cross-service expecting a complete `lines` array to compute per-line deltas (`transfer-order.service.ts:1487,1515`). Retrofitting a lean variant means auditing every caller — the same untraced-blast-radius risk already rejected for the entity `eager: true` flag itself, and no AC requires it. |
| Remove `TransferOrderEntity.lines`/`TransferOrderLineEntity.item`'s `eager: true` flags entirely | Rejected in G0/G1 discovery already (`00-intent.md` Out of scope) — wide blast radius across every `find*()` caller of the entity, most untraced. |
| Client-side pagination of an already-fully-fetched line array | Doesn't reduce actual query/payload cost — the whole point is to stop paying for line data the list/detail-open doesn't need yet. |
| Rewrite TO's `list()` (and the new endpoints' existence check) as a full `QueryBuilder` instead of `loadEagerRelations: false` | Larger diff for no functional gain once `loadEagerRelations: false` is confirmed to exist and work on the installed TypeORM version (see ADR-02) — would duplicate `where`/`order`/pagination logic that's already correct. |

## Contracts

### List/search endpoints — response `data[]` no longer carries `lines` (MODIFIED)
- `POST /v2/goods-receipts/search` (via `SearchGoodsReceiptsV2Handler`)
- `POST /v2/inventory/goods-issues/search` (via `SearchGoodsIssuesV2Handler`)
- `GET /inventory/transfer-orders` (via `TransferOrderService.list`)

Everything else about these responses (`data`, `total`, `page`, `limit`/`pageSize`, `totals`) is
unchanged — only the `lines` field disappears from each row in `data`.

### `GET /:id` detail endpoints — UNCHANGED
`GET /goods-receipts/:id`, `GET /inventory/goods-issues/:id`, `GET /inventory/transfer-orders/:id`
keep returning the full entity, including eager `lines` (with nested `item`/`location`), exactly as
today. No contract change.

### `GET /:id/lines?page=&pageSize=` — NEW, identical shape across GR/GI/TO
Request: `?page=<number, default 1>&pageSize=<number, default 20, capped at 100>`

Response 200:
```json
{
  "items": [
    {
      "id": "…",
      "itemId": "…",
      "item": { "code": "SKU001", "name": "…", "unit": "cái" },
      "locationId": "…",
      "location": { "code": "A1-01", "name": "…" },
      "uomCode": "cái",
      "quantity": "10.000",
      "unitPrice": "150000.00",
      "lineTotal": "1500000.00",
      "note": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "hasMore": true,
  "total": 214
}
```
Ordered by `createdAt ASC` (stable across pages — required for correct infinite-scroll accumulation).
`total` is a `COUNT(*)` scoped to one document's line FK, not a filtered global count, so it's cheap
enough to always include (unlike the optional `total` on generic list/lookup endpoints).

Failure modes: 404 (`NotFoundException`) if the document doesn't exist or is out of the actor's
org/branch scope; a document with zero lines returns 200 with `items: []`, `hasMore: false`,
`total: 0` — not an error.

## Error taxonomy

| Condition | Response | UI |
|---|---|---|
| `:id` doesn't exist, or exists in another org/branch | 404 `NotFoundException` on both `GET /:id` and `GET /:id/lines` | Existing not-found handling on `GET /:id` (unchanged); `/:id/lines` query surfaces the same error, infinite scroll stops |
| Document has zero lines | 200, `{ items: [], hasMore: false, total: 0 }` | DetailPanel shows its existing empty state; no further page request fires, no stuck "loading more" (AC-08) |
| `page` beyond the last page | 200, `{ items: [], hasMore: false, ... }` | Scroll listener sees `hasMore: false` and stops |
| List/search endpoints (US-01) | Unchanged — no new failure mode; this feature only removes a field from an already-passing response | n/a |

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| List rows (header only, post-trim) | Existing list-page query (`useCrudRecords`-style hook per page) | Page/filter session, as today |
| `selectedId` | `useDocumentListSelection` (unchanged) | Page session |
| Selected document header + full `lines` | New per-page `useQuery(["<entity>", selectedId], …)` against `GET /:id` | Cleared/refetched when `selectedId` changes |
| DetailPanel line pages | New per-page `useInfiniteQuery(["<entity>-lines", selectedId], …)` against `GET /:id/lines` | Cleared/refetched when `selectedId` changes; independent cache key from the header query so a header refetch doesn't discard already-scrolled line pages |

## ADRs

### ADR-01 — `GET /:id` keeps eager `lines`; only list/search endpoints drop it; a new paginated `/:id/lines` sub-resource is additive
**Context:** The feature's stated problem (`00-intent.md`) is that *list loads and page-turns* pay for
line data they never render — that cost scales with lines-across-the-page, not with the one document a
user opens. The initial framing of this feature also proposed trimming `GET /:id` itself, reasoning
that leaving it eager would mean the new `/:id/lines` endpoint "double-delivers" the same data on
document-open. Tracing `getById`'s actual callers shows that trim is unsafe: `getPrintPayload`
(print/export, all three entities) and, for GR/GI, `TransferOrderService.applyDeltaToLines`
(cross-service quantity-delta edits) both depend on `getById` returning the complete `lines` array —
see the Approach section above for exact call sites.
**Decision:** List/search endpoints (`SearchGoodsReceiptsV2Handler`, `SearchGoodsIssuesV2Handler`,
`TransferOrderService.list`) stop returning `lines`. `GET /:id` is left exactly as it is today. A new
`GET /:id/lines?page=&pageSize=` sub-resource is added purely additively, and is what the frontend's
DetailPanel uses for progressive/infinite-scroll rendering (US-03); the frontend's `GET /:id` fetch
supplies header fields and the barcode-scan toolbar's need for the complete line set (AC-09).
**Consequences:** Opening a single document still delivers its full line set once (via `GET /:id`,
unchanged) and, if the DetailPanel is shown, a second time in paginated form (via `GET /:id/lines`).
This is accepted: it's bounded to one document at a time (not multiplied across a page of documents,
which was the actual stated problem), it costs nothing beyond what already happens today, and avoiding
it would require re-plumbing a shared method (`findOrFail`/`getById`) with cross-service and
print/export dependents — a correctness risk out of proportion to a per-document network-cost
optimization that no AC requires.
**Status:** accepted

### ADR-02 — Bypass entity-level `eager: true` via `loadEagerRelations: false`, not a `QueryBuilder` rewrite
**Context:** `TransferOrderEntity.lines`'s `eager: true` (`transfer-order.entity.ts:97-101`) fires on
any `Repository` `find*()`/`findAndCount()` call, including `TransferOrderService.list()`
(`transfer-order.service.ts:465-470`) and the existence/scope check each new `GET /:id/lines` handler
needs to run before paginating lines. TypeORM's `FindOneOptions.loadEagerRelations` (inherited by
`FindManyOptions`, since `interface FindManyOptions<Entity> extends FindOneOptions<Entity>`) is
documented as: "Indicates if eager relations should be loaded or not. By default, they are loaded when
find methods are used." — confirmed present in the installed `typeorm@0.3.28`
(`node_modules/.pnpm/typeorm@0.3.28.../node_modules/typeorm/find-options/FindOneOptions.d.ts`), so this
option is real in this repo's TypeORM version, not merely a docs-site claim.
**Decision:** Use `loadEagerRelations: false` as a single added option on:
1. `TransferOrderService.list()`'s existing `this.toRepo.findAndCount({ where, skip, take, order })`
   call — every other option stays as-is.
2. The existence/scope-check `repo.findOne(...)` inside each new `GET /:id/lines` handler (GR, GI, and
   TO), in place of a hand-rolled `QueryBuilder` equivalent.
**Consequences:** Both call sites become a one-line addition to code that already exists (or, for the
new endpoint, a straightforward `findOne`) rather than a `QueryBuilder` rewrite that would duplicate
`where`/`order`/pagination logic already correct in `list()`. The entity-level `eager: true` flag itself
is untouched, so every other caller of `TransferOrderEntity`'s `find*()` methods (`findOrFail`,
`getById`, `getByCode`, etc.) keeps receiving eager-loaded `lines`/`item` exactly as before — satisfying
the non-functional requirement in `02-requirements.md`.
**Status:** accepted
