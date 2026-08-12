---
feature: batch-ledger-write
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | TypeORM's `insert().values([...]).execute()` (Postgres driver, `@erp/api`'s pinned TypeORM version) returns `result.identifiers` in the same order as the input `values` array | medium | no | Zipping `identifiers[i]` back onto `rows[i]` would mismatch ledger entry ids to the wrong movement — wrong `itemId`/`quantity` in published `STOCK_MOVEMENT_POSTED` events. Marked non-blocking because T-01-02's done-when requires a runtime length/order guard regardless, so a wrong assumption fails loudly in tests rather than silently in production. | pending | — |
| A-02 | "First movement wins" semantics for a duplicate `(itemId, storageId)` shelf-assignment within one batch (matches today's sequential-loop order) is the desired behaviour, not just an implementation artifact worth changing | high | no | A batch with two different locations for the same new item **in the same storage** could pick a different preferred shelf than expected — but this reproduces exactly what the current sequential code already does. (Caught during code review: the dedupe key must be `(itemId, storageId)`, not `itemId` alone — an item spanning two *different* storages in one batch gets an independent mapping per storage, matching the DB's own `UNIQUE(item_id, storage_id)` constraint and the sequential loop's per-storage existence check.) | pending | — |
| A-03 | Losing the per-line "before/after quantity" detail in the negative-balance warning log (replaced by a single post-UPSERT `RETURNING quantity < 0` sweep) is an acceptable behaviour change | high | no | Slightly less detail in an internal diagnostic log line only; no user-facing or business-logic impact | pending | — |
| A-04 | No new explicit cap is placed on batch size (Postgres bind-parameter ceiling, ~65,535/statement) — realistic warehouse imports (low thousands of lines) stay well under it; the DTO already has no line-count cap today | high | no | An import an order of magnitude larger than today's (tens of thousands of lines) could hit the Postgres parameter limit on the bulk INSERT/UPSERT and fail loudly instead of just being slow | pending | — |

## Rejected assumptions

_(none yet)_
