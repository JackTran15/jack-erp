---
feature: batch-ledger-write
adr_count: 2
---

# Logical design — Batch Ledger Write

## Approach

Keep `StockLedgerService.recordBatchMovements(movements, manager?)` synchronous, transactional,
and identical in signature. Replace its two O(n) sequential loops with a fixed small number
of batched SQL statements:

1. `assertStoragesActive` — unchanged, already a single `WHERE loc.id = ANY($1)` query.
2. `ItemStorageLocationService.validateAndAssignBatch(items, actor)` — new method,
   replacing the per-movement `validateAndAssignByLocation` loop
   (`stock-ledger.service.ts:264-271`). Loads every distinct `locationId` once (joined to
   `storages`, scoped by org/branch), then every existing `item_storage_locations` row for
   the `(itemId, storageId)` pairs in the batch once, then bulk-inserts the missing
   mappings with `ON CONFLICT (item_id, storage_id) DO NOTHING`. The rare "repair" path
   (existing mapping points at a now-invalid location) stays a per-row update — low volume,
   not worth batching.
3. `writeBatchMovements` — replaces the per-movement `manager.save()` loop with one bulk
   `INSERT ... INTO stock_ledger_entries` (TypeORM `insert().values([...])`), and replaces
   the per-movement `upsertBalance()` (`findOne` + `update`) loop with one aggregate-then-
   upsert: movements are summed in memory by `(organizationId, itemId, locationId)` first
   (Postgres rejects an `ON CONFLICT DO UPDATE` touching the same conflict row twice in one
   statement), then written with a single
   `INSERT ... ON CONFLICT (organization_id, item_id, location_id) DO UPDATE ... RETURNING
   item_id, location_id, quantity`. The `RETURNING` rows are filtered for `quantity < 0` in
   application code to reproduce today's negative-balance warning without a second query.

`stock_ledger_entries` is never aggregated — it is an immutable append-only audit log and
must stay 1:1 with the input movements.

Full sequence diagrams and pseudocode, already reviewed with the human:
https://claude.ai/code/artifact/139e0582-24cb-48ec-ac89-8bf350148de7

## Alternatives rejected

| Option | Why not |
|---|---|
| Move the ledger write to an async Kafka consumer (Kafka/Redpanda is already wired into this codebase) | Breaks the single-transaction atomicity that `post()` shares with journal entry, cash movement, and supplier-debt posting — would need a saga/compensation redesign for a performance problem that is really an O(n)-queries bug. Also breaks the documented contract that `POST /goods-receipts` returns an already-POSTED phiếu (`goods-receipt.service.ts:150-155`), forcing a polling UI. The total DB work is unchanged either way — Kafka would move where the 100+s happens, not remove it. |
| Chunk the batch into smaller synchronous sub-transactions (e.g. 200 lines at a time) | Same total round-trip count, same total wall-clock time, but now split across multiple transactions — loses all-or-nothing atomicity for a single goods-receipt, and does not address the root cause (per-line queries), just spreads them out. |
| Raise a DB/reverse-proxy timeout instead of fixing the query pattern | Treats the symptom; the request would still hold a transaction open and lock rows for 100+ seconds, still costs ~10k round-trips per import, and still degrades further as import size grows. |

## Domain model

No new entities, no schema/migration changes. Reused as-is:

| Entity | Relevant columns | Constraint this design relies on |
|---|---|---|
| `StockLedgerEntryEntity` (`stock_ledger_entries`) | item_id, location_id, quantity, unit_cost, line_value | No unique constraint — safe to bulk-insert one row per movement |
| `StockBalanceEntity` (`stock_balances`) | item_id, location_id, quantity, is_tracked | `UNIQUE(organization_id, item_id, location_id)` — the UPSERT conflict target; forces the in-memory aggregation step |
| `ItemStorageLocationEntity` (`item_storage_locations`) | item_id, storage_id, location_id | `UNIQUE(item_id, storage_id)` — the shelf-assignment UPSERT/INSERT conflict target |

## Contracts

No HTTP contract change. Internal method contract, unchanged signature:

```ts
recordBatchMovements(
  movements: RecordMovementParams[],
  manager?: EntityManager,
): Promise<StockLedgerEntryEntity[]>
```

New internal method (not exposed outside `ItemStorageLocationService`):

```ts
validateAndAssignBatch(
  items: { itemId: string; locationId: string }[],
  actor: ActorContext,
): Promise<void>
```

Failure modes: unchanged from today —
`BadRequestException("Không thể thao tác trên kho đã ngừng hoạt động: ...")`,
`BadRequestException("Vị trí không thuộc kho đang chọn hoặc không thuộc chi nhánh hiện tại")`.
No new failure mode introduced.

## State ownership

No new state. `StockLedgerService` and `ItemStorageLocationService` keep owning what they
already own; the aggregation map (`Map<orgId:itemId:locationId, delta>`) is a local variable
inside one call, not persisted state.

## Error taxonomy

| Condition | Failure subtype | Caller-visible behaviour |
|---|---|---|
| Location not found for org/branch during batch shelf-assignment | silently skipped (matches today's `return` in `validateAndAssignByLocation`) | no exception — unchanged |
| Location resolved but does not belong to the target storage | `BadRequestException` | unchanged message |
| One or more locations belong to an inactive storage | `BadRequestException` | unchanged message, still blocks the whole batch |
| TypeORM bulk-insert identifier count mismatch (defends A-01) | thrown `Error` inside the transaction → transaction rolls back | new defensive guard (see T-01-02); surfaces as the existing generic `createAndPost` catch-all, no new user-facing message |

## Cache & offline

Not applicable — backend write path, no client cache involved.

## Observability

- `logger.warn` for negative balances: same log line shape, now emitted once per affected
  `(item, location)` pair per batch (via the `RETURNING` sweep) instead of once per
  movement — strictly fewer, not zero.
- `publishMovementEvents` (Kafka `STOCK_MOVEMENT_POSTED`) unchanged: still fires once per
  saved ledger entry, still only after the DB transaction commits.
- No new metrics added in this fix; T-01-03 verifies the performance improvement by timing
  the real 1.686-line import, not by adding new instrumentation.

## ADRs

### ADR-01 — Keep the ledger write synchronous and transactional; batch the SQL instead of moving it off the request path
**Context:** The batch write path is slow (111-139s observed) because it issues ~5-8
sequential DB round-trips per movement. Kafka is already used elsewhere in this codebase,
raising the question of whether to process large batches asynchronously instead.
**Decision:** Keep `recordBatchMovements` synchronous and inside `post()`'s single DB
transaction. Fix the O(n) query pattern with batched SQL (bulk insert/upsert, aggregated
deltas) so the same synchronous call becomes O(1) in round-trips.
**Consequences:** `POST /goods-receipts` keeps returning an already-POSTED phiếu with no
polling UI needed. Atomicity with journal/cash/supplier-debt posting is preserved for free.
The fix is scoped to two files instead of a cross-cutting async redesign. Very large
imports (tens of thousands of lines, see A-04) remain a known, explicitly out-of-scope
limit rather than something this ADR claims to solve.
**Status:** accepted

### ADR-02 — Aggregate stock_balances deltas before UPSERT; never aggregate stock_ledger_entries
**Context:** A multi-row `INSERT ... ON CONFLICT DO UPDATE` cannot affect the same
conflict-key row twice in one statement (Postgres error). The real import file has 6 SKUs
appearing on two separate lines each at the same location.
**Decision:** Sum `RecordMovementParams.quantity` in application memory, keyed by
`(organizationId, itemId, locationId)`, before building the `stock_balances` UPSERT.
`stock_ledger_entries` is never aggregated — one row per input movement, always, because
it is the immutable audit trail and must reconcile 1:1 against the source document's lines.
**Consequences:** One extra in-memory reduce step (no DB cost). The UPSERT's `RETURNING`
rows are per aggregated key, not per input line, so negative-balance detection reports on
the aggregated result — acceptable per A-03.
**Status:** accepted
