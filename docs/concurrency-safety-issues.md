# Concurrency-Safety Issues Report

**Scope:** `apps/api/src/` — audit of Idempotency, Distributed Locking, Optimistic Concurrency Control (OCC), and **all DB insert/update flows** (not just HTTP mutation endpoints) for read-modify-write, status-transition, and check-then-insert races.

**Date:** 2026-07-09 · **Type:** Static read-only audit. Write-primitive census: `.save()`×285, `.update()`×118, `.insert()`×13, `.upsert()`×5, `.increment()`×3, `.decrement()`×2 across the codebase. **No code changed.**

**Severity legend:** 🔴 Critical (data corruption) · 🟠 High · 🟡 Medium · 🔵 Low / informational.

**Root cause common to most findings:** there is **no `@VersionColumn` anywhere** (no OCC fallback) and **no distributed lock**. Pessimistic Postgres row locks exist in only a handful of flows. Everywhere else, an unlocked read-modify-write or check-then-act silently loses — it never throws.

---

## Summary table

| # | Sev | Problem | Location |
|---|-----|---------|----------|
| **A. Balance / counter lost-update (unlocked read-modify-write)** ||||
| A1 | 🔴 | **Cash account balance** — single funnel for ALL cash movements, unlocked RMW | `cash.service.ts` |
| A2 | 🔴 | **Stock balance** — shared stock-posting path, unlocked RMW → oversell | `stock-ledger.service.ts` |
| A3 | 🟠 | POS debt payment `collectPayment` — `paidAmount`/`remainingAmount` unlocked RMW | `invoice-debt.service.ts` |
| A4 | 🟠 | Return/refund debt offset — same `invoice_debts` row, unlocked | `checkout-return.service.ts` |
| A5 | 🟠 | Receivables `collect` — `settledAmount` unlocked RMW, guard on stale read | `receivables.service.ts` |
| A6 | 🟠 | Payables `settle` — `settledAmount` unlocked RMW | `payables.service.ts` |
| A7 | 🟠 | Membership `adjustPoints` — atomic increment but **unlocked floor guard** → negative points | `membership-card.service.ts` |
| A8 | 🟡 | Customer store-credit `redeem` — unlocked overdraw (latent: no caller yet) | `customer-credit.service.ts` |
| **B. Status-transition double-post (read-status-then-update, no lock / no in-tx recheck)** ||||
| B1 | 🟠 | goods-receipt post/cancel | `goods-receipt.service.ts` |
| B2 | 🟠 | goods-issue post/cancel | `goods-issue.service.ts` |
| B3 | 🟠 | adjustment post/approve/cancel | `stock-adjustment.service.ts` |
| B4 | 🟠 | stock-take post/cancel/merge | `stock-take.service.ts` |
| B5 | 🟠 | purchase-order approve/receive/cancel | `purchase-order.service.ts` |
| B6 | 🟠 | transfer-order export/import/update | `transfer-order.service.ts` |
| B7 | 🟡 | journal `reverse` — non-locked guard → double-reverse | `journal.service.ts` |
| B8 | 🟡 | checkout draft guard — non-locked → double checkout | `checkout-invoice.service.ts` |
| **C. Check-then-insert duplicate races** ||||
| C1 | 🟠 | pos-session `openSession` — **no unique constraint** → duplicate OPEN sessions per till | `pos-session.service.ts` |
| C2 | 🟠 | variant `resolveOrCreateVariant` — "atomic" claim false; check outside tx, no combo constraint | `variant-generation.service.ts` |
| C3 | 🟡 | registration `approve` — double-approval → duplicate org/branch | `registration.service.ts` |
| C4 | 🟡 | stock-deduction consumer dedup not constraint-backed | `stock-deduction.consumer.ts` |
| C5 | 🔵 | resolve-or-create helpers — constraint-backed but uncaught `23505` → 500 (availability, not correctness) | `inventory-location*.service.ts`, pos-session recon |
| **D. Structural mechanism gaps** ||||
| D1 | 🟠 | HTTP idempotency is opt-in — header-less mutations bypass dedupe | `idempotency.interceptor.ts` |
| D2 | 🟠 | No distributed lock exists (Postgres row locks only) | app-wide |
| D3 | 🟡 | OCC absent; the one manual version check is inert (dead code) | `base-crud.service.ts` |
| D4 | 🔵 | Idempotency store-write failures swallowed → retries can re-execute | `idempotency.interceptor.ts` |

---

# A. Balance / counter lost-update races

All of these do `findOne` (no lock) → arithmetic in JS → `save`. Concurrent writers read the same starting value; last write wins; the guard (insufficient-balance / overpay) is checked against the **stale** read so it can also be bypassed.

## A1 🔴 Cash account balance — the central miss

**Location:** `apps/api/src/modules/accounting/cash/cash.service.ts`
- `recordSingleAccountMovementInTx`: `findOne(CashAccountEntity)` L122-124 (no lock) → `newBalance = Number(balance) + delta` L243 → `save` L276-277.
- `recordTransferInTx`: `findOne` dest L149 (no lock) → `source.balance -= amount; dest.balance += amount` L175-177 → `save([source, dest])`.

**Why critical:** this is the **single funnel for every cash balance mutation** — every receivable cash collection, payable cash settlement, and POS debt cash payment calls `cashService.recordMovement`, all targeting the same branch till (via `cashFundResolver.resolveOrDefault`). The pessimistic locks in `cash-receipts.service.ts`/`cash-payments.service.ts` (L251/L327) lock the **voucher row** for its own status transition — they do **not** lock the cash account. So even a "safe" locked voucher post mutates `cash_accounts.balance` through this unlocked path.

**Impact:** two concurrent postings on one till both read balance=100 (+50, +30) → balance ends 130 or 150 instead of 180. Both `cash_movements` rows and both journal entries persist, so the **ledger and the denormalized `balance` column silently diverge**. Insufficient-balance guard (L165/L245) checked against stale read → can be bypassed.

## A2 🔴 Stock balance — oversell

**Location:** `apps/api/src/modules/inventory/ledger/stock-ledger.service.ts:621-667` (`upsertBalance`)

`recordMovement` (`:147`) and `recordBatchMovements` (`:248`) — used by **checkout, goods-issue, goods-receipt, adjustments, stock-take** — funnel into `upsertBalance`: unlocked `findOne(StockBalanceEntity)` (`:625-631`) → `newQuantity = quantity + qty` → `update()` (`:634-647`). No `pessimistic_write`, default READ COMMITTED (tx at `:267`, `checkout-invoice.service.ts:216`). Only `stock-transfer.service.ts:630,767,1102` pre-locks the balance row; the other five paths do not. Negative balances only *log a warning* (`:636-641`), never blocked. The `@Unique(org,item,location)` constraint bounds row identity but not the `quantity` RMW.

## A3 🟠 POS debt payment — `collectPayment`

**Location:** `apps/api/src/modules/pos/services/invoice-debt.service.ts` (endpoint `POST invoice/debts/:debtId/payments`, `invoice.controller.ts:128-136`)

`findOne(InvoiceDebtEntity)` L155-157 (no `setLock`) → `paidAmount += amount; remainingAmount = originalAmount - paidAmount` L189-190 → `save` L198. Overpay guard L167 on stale read. **Distinct from** the debt-collection saga (which IS locked). Two concurrent payments of 100 on a debt owing 100 both pass → `paidAmount` lost-update, two `debt_payments` rows + two cash movements for a debt that owed 100.

## A4 🟠 Return/refund debt offset

**Location:** `apps/api/src/modules/pos/services/checkout-return.service.ts` (~L450-480)

`findOne(InvoiceDebtEntity, {invoiceId, org})` L452-457 (no lock) → `applied = min(refund, remaining); paidAmount += applied; remainingAmount = originalAmount - paidAmount` L470-474 → `save` L480. Races the `collectPayment` path (A3) on the **same `invoice_debts` row** → one update lost, debt balance corrupted.

## A5 🟠 Receivables `collect`

**Location:** `apps/api/src/modules/accounting/receivables/receivables.service.ts` → `collect`

`findOne` L140-143 (no lock, **before** the tx opens at L166) → `settledAmount += dto.amount` L181-182 → `save` L191. Overpay guard L158-160 on stale read. Settlement rows are append-only (safe); the denormalized `settledAmount` running total is the lost-update surface, and PARTIALLY_SETTLED/SETTLED status is computed from it.

## A6 🟠 Payables `settle`

**Location:** `apps/api/src/modules/accounting/payables/payables.service.ts` → `settle` — structurally identical to A5. `findOne` L132-135 (no lock, before tx at L157) → `settledAmount += dto.amount` L171 → `save` L179. Guard L150-151 on stale read.

## A7 🟠 Membership `adjustPoints` — unlocked floor guard

**Location:** `apps/api/src/modules/customer/services/membership-card.service.ts:84-122`

The *write* is atomic (`manager.increment` L107-118), but the *insufficient-points guard* is not: `findOne` L89 (no lock, unlike `redeemPointsForInvoice` at L177 which locks) → `resultingPoints = card.points + dto.delta` guarded `>= 0` L100-105 against the **stale** read. Two concurrent REDEEM adjustments — or an `adjustPoints` REDEEM racing checkout `redeemPointsForInvoice` on the same card — both read `points=100`, both pass `100 + (-80) >= 0`, both decrement → **negative / overspent points**. Atomic increment prevents lost update but does not enforce the floor.

## A8 🟡 Customer store-credit `redeem` — latent overdraw

**Location:** `apps/api/src/modules/customer/services/customer-credit.service.ts:72-113`

`findOne` L80 (no lock) → `if (remaining < amt) throw` L96 on stale read → `remaining - amt` in JS → `save(credit)` L102-108. No lock, no version, no atomic guarded `UPDATE ... WHERE remaining_amount >= :amt`. **Currently dead code** — only `issue()` is wired (`checkout-return.service.ts:253`); `redeem()` has no caller. Becomes a live double-spend the moment a store-credit-as-payment checkout path calls it. Fix before wiring.

---

# B. Status-transition double-post races

Every document post/cancel reads the row **unlocked, outside** the mutating transaction, checks status in JS, then updates inside a fresh transaction that does **not** re-read or re-check status. All define a `TRANSITIONS` map + `validateTransition`, but validation runs against a stale in-memory status; nothing serializes the read against the write. Two concurrent posts both see `DRAFT` → both write ledger movements / journal entries → **double stock + double accounting**.

| ID | Service | Post path (unlocked read → unconditional update) | Cancel path |
|----|---------|--------------------------------------------------|-------------|
| B1 | `goods-receipt.service.ts` | `findOrFail` L326 → tx L369 → `update({status:POSTED})` L472 | `save` L318 |
| B2 | `goods-issue.service.ts` | `findOrFail` L207 → tx L233 → `update(id,{status:POSTED})` L265 | `save` L317 |
| B3 | `stock-adjustment.service.ts` | `findOrFail` L289 → `update({status:POSTED})` L270 | submit/approve/reject/cancel L108-175 |
| B4 | `stock-take.service.ts` | `findOrFail` L1664 → `update({status:POSTED})` L719 (spawns GR/GI) | `save` L599; merge has partial affected-row guard L286-297 |
| B5 | `purchase-order.service.ts` | receive: status check L122 → `update` lines L154 + PO L196 | approve L100-113, cancel L205-208 |
| B6 | `transfer-order.service.ts` | export: DRAFT check L762 → `update` L802; import: L1013 → `update` L1135 | update L604-748 |

**Concrete failure examples:**
- B1/B2: concurrent double-post → stock movements + journal written twice.
- B5 receive: both pass L122 → PO lines over-received (`receivedQty` double-incremented), duplicate goods receipts.
- B6 export: two concurrent exports of one DRAFT order → two GoodsIssues, source stock double-deducted.
- Post + cancel interleave: cancel a just-posted document without reversing its ledger.

## B7 🟡 Journal `reverse` — `journal.service.ts:154-263`
Guards on status `POSTED` and `reversedByJournalId` via non-locked read-then-write → concurrent double-reverse can produce two mirror entries for one journal.

## B8 🟡 Checkout draft guard — `checkout-invoice.service.ts:106-118`
Non-locked draft-state read before commit → two concurrent checkouts of the same draft both pass. Partially mitigated downstream by document-numbering's locked sequence and points redemption's card lock, but the draft itself is not serialized.

---

# C. Check-then-insert duplicate races

## C1 🟠 pos-session `openSession` — unconstrained duplicate sessions

**Location:** `apps/api/src/modules/pos/services/pos-session.service.ts:62-88`

`findOne` active session for the cash account (status IN OPEN/ACTIVE_SALES) → if found throw → else `save` new OPEN session L88. `pos-session.entity.ts:7` has only a **non-unique** `@Index(['org','branch','status'])`. No lock, **no unique constraint**. Two concurrent opens on the same till both miss → **two OPEN sessions on one cash fund** → reconciliation / cash integrity broken. (`activate`/`close`/`approveVariance` L101-240 are also unlocked transitions, lower severity.)

## C2 🟠 Variant `resolveOrCreateVariant` — the "atomic" claim is false

**Location:** `apps/api/src/modules/inventory/product/variant-generation.service.ts:102-127`

`findExistingVariant` (L116-122) runs on the **default manager, outside any transaction**, and returns early if found; only the create path opens `dataSource.transaction` (L124-126). Check-then-act is split across two DB contexts.
1. **Duplicate variant (same combo):** `item-attribute-value.entity.ts:9` only has `@Unique(['itemId','attributeDefinitionId'])` — does NOT constrain the full combo. No lock. Two concurrent calls with the same combo both miss → duplicate variant items for the same product/combo.
2. **Duplicate code:** `item.entity.ts:12` has `@Unique(['org','code'])`, but `createVariantItem` (L260) does **not** catch `23505`, so concurrent identical codes yield an **uncaught 500**, not a graceful retry. The collision-retry loop only helps sequentially.

## C3 🟡 Registration `approve` — duplicate org/branch

**Location:** `apps/api/src/modules/registration/registration.service.ts:100-125`

Unlocked `findById` → `APPROVABLE_STATUSES` check L106 → `createOrgFromRequest`/`createBranchFromRequest` L112-116 → flip `status=APPROVED` + save L118-122. No atomic `UPDATE ... WHERE status IN (...)`, no lock, no unique key on the created org. Two concurrent approvals both pass → **duplicate organization + branch**. Low-concurrency admin action.

## C4 🟡 Stock-deduction consumer dedup not constraint-backed

**Location:** `apps/api/src/modules/inventory/consumers/stock-deduction.consumer.ts:33-76`

App-level dedup — `findOne` on `(referenceType, referenceId, itemId, org)` then skip — with **no backing unique constraint**, and calls `recordBatchMovements` *without* a `manager` (own tx, no lock). Race window between dedup check and insert; combined with A2, concurrent deliveries can double-post. Note: separate from the robust `processed_events` layer (see "working well").

## C5 🔵 Resolve-or-create helpers — availability bug, not correctness

Constraint-backed inserts that **do not catch `23505`**, so a first-time concurrent resolve 500s instead of returning the existing row:
- `inventory-location-stock.service.ts:193-213, 267-288` — StockBalance insert (constraint `@Unique(org,item,location)`).
- `inventory-location.service.ts:167-244` — category/brand/unit/provider resolve-or-create (each has a unique constraint).
- `pos-session.service.ts:168-201` — `openReconciliation` (constraint `@Index(unique)` on `session-reconciliation.entity.ts:6`).

Correctness is safe (DB rejects the duplicate); the defect is an uncaught 500 under race. `item-crud.service.ts:676-684`, `product-attribute.service.ts:53,76`, and `temp-warehouse.service.ts:1176-1182` DO catch `23505` — the pattern to copy.

---

# D. Structural mechanism gaps

## D1 🟠 HTTP idempotency is opt-in, not enforced
**Location:** `common/interceptors/idempotency.interceptor.ts:15,31-41` — global (`common.module.ts:15`) but short-circuits when method is `GET/HEAD/OPTIONS` or **no `x-idempotency-key` header** is present. No route-level enforcement, no `@Idempotent`/`@SkipIdempotency` decorator, no must-be-idempotent list. Riskiest financial/stock endpoints rely on the client to send the key. DB-level mitigations exist only for the two sagas (`UQ_*_saga_idem`) and CSV imports (`@Unique(org,type,idempotencyKey)`).

## D2 🟠 No distributed lock exists
No `redlock`/lock library; grep for `redlock`/`SETNX`/`acquireLock`/`withLock`/`pg_advisory` → zero. `redis.service.ts` has no `SET NX`. All serialization is Postgres row locks: document-numbering (`SERIALIZABLE`+`pessimistic_write` `:342-348`), cash vouchers, stock-transfer, membership cards, outbox (`FOR UPDATE SKIP LOCKED` `:82`). Sufficient on a single Postgres primary; a gap only if scaled to multiple primaries.

## D3 🟡 OCC absent; manual version check is dead code
`@VersionColumn` appears nowhere. `base-crud.service.ts:115-126` compares `payload.version` vs `existing.version` and throws `ConflictException`, but no entity has a `version` column so the branch never fires (also TOCTOU, never increments). `update-customer.dto.ts:47` is the only DTO with `version?`, feeding the inert branch. No optimistic-lock fallback exists, so every unlocked RMW above silently loses instead of throwing.

## D4 🔵 Idempotency store-write failures swallowed
`idempotency.interceptor.ts:94-99` — if the Redis write fails *after* a successful mutation, the error is swallowed and the response returns, but the key is never persisted → a client retry re-executes.

---

# What is working well (do not re-flag)

- **Event-consumer idempotency** — `processed_events` (composite PK per consumer) + claim-before-work/release-on-failure (`event-consumer.service.ts:135-156`, `event-idempotency.service.ts:21-44`), exactly-once via deterministic `uuidv5` ids (`deterministic-event.ts:16-21`). Strongest part of the system.
- **Document numbering** — `SERIALIZABLE` tx + `pessimistic_write` on the counter row (`document-numbering.service.ts:342-348`).
- **Outbox relay** — `FOR UPDATE SKIP LOCKED` (`outbox-relay.service.ts:82`).
- **Stock transfer** — pre-locks `StockBalanceEntity` with `pessimistic_write` (`:630,767,1102`) — the pattern the A2 endpoints should copy.
- **Cash vouchers** — lock the voucher row for its own status transition (`cash-receipts/payments.service.ts:251,327`; debt & supplier sagas `:269/302`, `:270/308`); voucher ledger append-only. (But they still hit the unlocked cash balance — A1.)
- **Membership `redeemPointsForInvoice`** — `pessimistic_write` + re-validate + decrement (`membership-card.service.ts:170-211`). `awardPointsForInvoice` earn-only atomic increment, consumer dedupes by invoice.
- **Promotion / voucher / discount-code counters** — atomic guarded UPDATE: `discount-code.service.ts:127-138` `SET used_count = used_count + 1 WHERE ... used_count < max_uses`, throws on `affected===0`; `voucher.service.ts:123-132` `markUsed` throws on `affected===0`. Overuse-safe.
- **RBAC / assignment uniqueness** — user↔branch `@Unique(['userId','branchId'])`, user email `@Unique(['email','organizationId'])`, employee code `uq_employee_profile_org_code` all backstop read-then-insert.

---

# Verification commands

```bash
# No distributed lock, no OCC anywhere
grep -rn "redlock\|SETNX\|acquireLock\|withLock\|pg_advisory" apps/api/src   # → empty
grep -rn "VersionColumn" apps/ packages/                                     # → empty

# Row locks that DO exist (the safe flows)
grep -rn "pessimistic_write\|SERIALIZABLE\|FOR UPDATE" apps/api/src

# A1: unlocked cash balance funnel
sed -n '120,280p' apps/api/src/modules/accounting/cash/cash.service.ts

# A2: unlocked stock-balance path
sed -n '621,667p' apps/api/src/modules/inventory/ledger/stock-ledger.service.ts

# A3/A4: unlocked invoice_debts RMW
sed -n '150,200p' apps/api/src/modules/pos/services/invoice-debt.service.ts

# B: status transitions read status unlocked, update without recheck
grep -rn "findOrFail\|validateTransition" apps/api/src/modules/inventory/goods-receipt apps/api/src/modules/inventory/goods-issue

# C1: pos-session has no unique constraint on active session
grep -n "Unique\|Index" apps/api/src/modules/pos/**/pos-session.entity.ts

# C2: variant existence check runs outside the transaction
sed -n '102,127p' apps/api/src/modules/inventory/product/variant-generation.service.ts

# Which write paths catch 23505 (the pattern to copy for C5)
grep -rn "23505\|UNIQUE_VIOLATION\|isUniqueViolation" apps/api/src
```
