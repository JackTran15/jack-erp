---
feature: inventory-list-lazy-detail
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Inventory List Lazy Detail

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Goods Receipt list loads; first row's detail panel renders line content | `/inventory/purchase-orders` | — | AC-08, AC-10 | text=Mã SKU |
| S2 | Goods Receipt doc-number link opens a fresh per-document detail dialog | `/inventory/purchase-orders` | `click table tbody tr:first-child button` | AC-04, AC-10 | text=CHI TIẾT |
| S3 | Goods Issue list loads; first row's detail panel renders line content | `/inventory/goods-issues` | — | AC-08, AC-10 | text=Mã SKU |
| S4 | Goods Issue doc-number link opens a fresh per-document detail dialog | `/inventory/goods-issues` | `click table tbody tr:first-child button` | AC-05, AC-10 | text=CHI TIẾT |
| S5 | Transfer Order list loads; first row's detail panel renders line content | `/inventory/transfer-orders` | — | AC-08, AC-10 | text=Mã SKU |
| S6 | Transfer Order doc-number link opens a fresh per-document detail dialog | `/inventory/transfer-orders` | `click table tbody tr:first-child button` | AC-06, AC-10 | text=CHI TIẾT |

## Not verified here

- **AC-01, AC-02, AC-03** (list response JSON contains no `lines` array / query doesn't join
  `lines`) — a network-payload shape claim, not DOM-observable via `text=`/`no-text=`/`count`. A
  live click-through confirms indirectly that the list renders without error (this refactor's
  most likely visible regression — the real "Tổng tiền" column crash T2's construction found and
  fixed, from `row.lines` becoming `undefined` — would have shown as a broken list here). The
  authoritative claim is proved by `search-goods-receipts-v2.handler.spec.ts`,
  `search-goods-issues-v2.handler.spec.ts`, and `transfer-order.service.spec.ts` (assert the
  query builder never joins `lines`).
- **AC-07** (a 200+-line document loads its lines incrementally via scroll) — no document with
  that many lines exists in the current seed data for any of the three entities (largest observed
  live: 3 lines, on a Transfer Order). Seeding one is a fixture/data concern outside this
  verification pass, not a code change. Covered instead by each UoW's construction-time test
  (`T-0X-04`'s infinite-scroll component tests, mocking a large paginated response).
- **AC-09** (barcode-scan toolbar action rewired to fetch detail instead of reading `row.lines`)
  — the "In tem mã" action opens a print/label flow, which risks a new window or a download if
  driven blind; not run live this pass. Covered by construction-time code review (T2's own report:
  the barcode-toolbar action was found broken by the list-trim and explicitly rewired to source
  from a detail fetch) and by each UoW's regression test for that call site.

## Notes

All three entities share the same `DetailPanel`/edit-dialog component pattern — confirmed live
(not assumed) by walking all three pages before writing this file: the bottom "Chi tiết" panel
auto-selects the first row and shows its lines immediately (column header "Mã SKU" is the
reliable signal), and clicking a document-number link opens a modal whose line-items section is
always headed "CHI TIẾT" regardless of entity. `S2`/`S4`/`S6`'s selector
(`table tbody tr:first-child button`) targets the document-number link, which was confirmed live
to be the row's only `<button>` — `.first()` on that selector is unambiguous.
