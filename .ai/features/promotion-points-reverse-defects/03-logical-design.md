---
feature: promotion-points-reverse-defects
adr_count: 5
---

# Logical design — Points reverse & balance snapshot defects

## Approach

Both defects are the same mistake made in two places: **points are re-derived from money
instead of read from the invoice.** That was safe for as long as
`points_earned = floor(amount_due / 10 000)` held for every invoice. Defect #10 broke the
identity — a blocked invoice moves 800.000đ and earns 0 — and every consumer that still
multiplies money by the rate now produces a number the invoice itself contradicts.

The fix is to make **the invoice's own persisted point columns the single source of truth on
the reverse side**, and to make the balance projection read the same gated value the invoice
stores. Four changes, no schema migration:

1. **#15 — `persist-invoice.step.ts:86`.** `totals.pointsEarned` → `invoice.pointsEarned`. The
   gated value is computed on line 73, thirteen lines earlier, and was simply not used here.
2. **Contract.** `LoyaltyPointsReversePayload` gains an optional `points`. The consumer uses
   it when present and falls back to the money derivation when absent, so events already in
   the topic at deploy time still process correctly (A-05).
3. **#16 — `cancel-invoice.service.ts:168`.** Publish `points: invoice.pointsEarned`. A cancel
   is a full void, so the number to reverse is exactly what was earned — no proration. The
   service's own `pointsReversed` (line 96) and `pointsBalanceAfter` (line 116) already read
   that value, which is why they were right while the card was wrong.
4. **Return — `checkout-return.service.ts`.** A new `computeReversePoints()` returns
   `min(floor(computeReverseBase(...) / rate), originalInvoice.pointsEarned)`, falling back to
   the uncapped money derivation for QUICK returns with no original. Both line 345
   (`invoice.pointsReversed`) and line 1122 (the published event) read it, so the snapshot and
   the card cannot drift apart the way they did in #16.

`subtotalDelta` stays on the payload. It is still meaningful as the money being reversed, it
is what the log lines and the existing specs read, and it is the compatibility fallback.

The assessment slice (US-04) is a read-only query pass over `erp_clone_prod`, producing counts
and a written recommendation. It changes no data and unlocks a decision that is explicitly the
owner's, not this feature's.

## Alternatives rejected

| Option | Why not |
|---|---|
| Cancel sends `pointsEarned * POINT_EARN_VND_PER_POINT` so the consumer's existing `floor()` lands on the right number | Fixes the symptom by encoding the rate in a second place and leaves money as the source of truth for points — the exact arrangement that produced both defects. Also cannot express "reverse 0 while 800.000đ moved", because the publisher refuses `subtotalDelta <= 0` |
| Consumer reads `invoices.points_earned` itself instead of taking it on the payload | Turns a self-contained event into one that needs a cross-module DB read at consume time, and reintroduces a race: the reverse consumer would read a row the cancel transaction may not have committed yet |
| Re-derive the return reverse by prorating `points_earned` (`floor(earned × returnedNet / amountDue)`) | Conceptually cleaner but rounds differently from today's money derivation on partial returns, so pinned expectations in `checkout-return.service.spec.ts` (464.000 / 800 / 190) would have to move and QA would need to re-baseline partial returns — cost with no correctness gain. Rejected as A-02, confirmed by Akenzy |
| Make `points` a required payload field | Requires draining `LOYALTY_POINTS_REVERSE` before deploy, or in-flight events fail validation and land in the DLQ. The optional field costs one `??` |
| Also fix v1 `checkout-invoice.service.ts` in this feature | v1 has no `pointsBlocked` at all, so this is not a patch but new plumbing of `appliedPrograms` through a service that never carried them. Out of scope per `00-intent.md`, with its own follow-up ticket |
| Suppress the delta-0 `point_history` row when nothing is reversed | The consumer's replay guard keys on `type = ADJUST AND delta <= 0`; removing the row needs a different dedup marker. New correctness risk to delete a cosmetic row. Rejected as A-04 |

## Domain model

| Concept | Where it lives | Notes |
|---|---|---|
| `pointsBlocked` | `CheckoutStepContext.totals` (`checkout-step.ts:133`) | v2 saga only, computed once at `compute-totals.step.ts:91`; never persisted |
| `invoice.points_earned` | `invoice.entity.ts:85` | The persisted outcome of that decision. **The reverse side's source of truth after this feature** |
| `invoice.points_reversed` | `invoice.entity.ts:88` | What a cancel or return clawed back; must equal what the consumer actually applied |
| `invoice.points_balance_after` | `invoice.entity.ts:98` | A projection for the receipt, never re-read as truth. `NULL` = unknown |
| `MembershipCardEntity.points` | `membership-card.entity.ts` | The real balance. Mutated only by the loyalty consumers and `refundRedeemedPoints` |
| `PointHistoryEntity` | `point-history.entity.ts` | Append-only ledger; `ADJUST` with `delta <= 0` is the reverse consumer's own marker |

## Contracts

### `LOYALTY_POINTS_REVERSE` — `LoyaltyPointsReversePayload`

```ts
{
  returnInvoiceId: string;
  customerId: string;
  /** Money being reversed. Audit value, and the fallback when `points` is absent. */
  subtotalDelta: number;
  /** NEW — authoritative point count. Absent only on events published before this deploy. */
  points?: number;
  branchId?: string;
  organizationId: string;
  actorId: string;
}
```

Consumer resolution, replacing `loyalty-points-reverse.consumer.ts:60-62`:

```ts
const requestedDelta = payload.points ?? Math.floor(
  Math.abs(Number(payload.subtotalDelta)) / POINT_EARN_VND_PER_POINT,
);
```

Everything downstream is unchanged: the `requestedDelta <= 0` branch still writes the delta-0
NO-OP row, and `actualDelta = Math.min(requestedDelta, card.points)` still clamps.

**Producers**

| Producer | `points` sent | Reason |
|---|---|---|
| `cancel-invoice.service.ts:168` | `invoice.pointsEarned` | A cancel voids the whole sale; ratio is 1 |
| `checkout-return.service.ts:1122` | `computeReversePoints(originalInvoice, totals)` | Prorated by money, capped at what was earned |
| Anything else | — | There is no third producer; `grep loyaltyPointsReversePublisher` returns these two |

The publisher's existing `if (input.subtotalDelta <= 0) return false` guard is unchanged.
A blocked cancel still has `subtotalDelta = 800.000` and so still publishes, carrying
`points: 0` — which is what produces the NO-OP history row that the replay guard needs.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `pointsBlocked` | `ComputeTotalsStep` | One checkout request |
| `points_earned` / `points_reversed` | The document that wrote them | Permanent; immutable after posting |
| `points_balance_after` | The document that wrote it | Permanent snapshot; a projection, never authoritative |
| Card balance | `LoyaltyPointsAwardConsumer`, `LoyaltyPointsReverseConsumer`, `MembershipCardService.refundRedeemedPoints` | Permanent |

## Error taxonomy

This is event-consumer territory: a throw sends a financial event to the DLQ, so every row
below is handled and logged rather than raised.

| Condition | Handling | Log level |
|---|---|---|
| `points` absent (event published before this deploy) | Fall back to `floor(\|subtotalDelta\| / rate)` — today's behaviour exactly | `log`, naming the fallback |
| `points === 0` while `subtotalDelta > 0` (blocked accrual) | Write the delta-0 `ADJUST` row, decrement nothing | `log`, stating that accrual was blocked so nothing is reversed |
| `points` greater than the card's balance | Existing clamp `min(requestedDelta, card.points)` | existing `warn` |
| No active card for the customer | Skip, no row | existing `warn` |
| Duplicate event | Skip on the existing `ADJUST AND delta <= 0` lookup | existing `log` |
| QUICK return, no original invoice to cap against | Uncapped money derivation, as today | `log`, naming the missing original |
| Producer omits `points` after this feature | Indistinguishable from the compatibility case at runtime — caught by spec, not by code | — |

## Cache & offline

Not applicable. No cached read path is touched; the receipt reads `points_balance_after`
straight off the checkout response, which is why the wrong value reached print.

## Observability

- The reverse consumer's existing log gains the resolved point count and its source
  (`payload` vs `money-fallback`), so a producer that stops sending `points` is visible in
  logs rather than only in a customer complaint.
- No new metric. The success signal is asserted by tests and by the QA re-run, not by a
  dashboard.

## ADRs

### ADR-01 — The reverse event carries points; money stays as the fallback
**Context:** `LoyaltyPointsReverseConsumer` re-derives points from `subtotalDelta`. That was
correct while `points_earned = floor(amount_due / rate)` held for every invoice. Defect #10
broke the identity and the consumer had no way to know.
**Decision:** Add an optional `points` to `LoyaltyPointsReversePayload`, authoritative when
present. Keep `subtotalDelta` as the audit value and as the fallback for events already in
the topic at deploy time.
**Consequences:** Both producers must supply it, and `points ?? money` cannot distinguish a
legitimately old event from a producer that forgot — so each producer gets a spec asserting
the field. In exchange the deploy needs no topic drain and no coordinated release.
**Status:** accepted

### ADR-02 — A return reverses `min(money-derived, original.points_earned)`, on a repaired column
**Context:** The return path prorates by money. For a blocked original that yields points
that were never accrued; for every other case it is already correct.

**Revised 2026-08-19, after G2 was reopened.** The first version of this ADR assumed
`points_earned = 0` means "this invoice earned nothing". Construction disproved it: 24 of 90
posted customer sales in `erp_clone_prod` read 0 while the ledger shows a real earn, 3.224
points in total, every one issued before 2026-07-20 (the column was added by `c9488fab` on
2026-07-16 and rows around that deploy were never populated). Capping on the column as it
stands would refuse to reverse those 3.224 points — the mirror image of the defect being
fixed. `checkout-return.service.spec.ts` failed ten cases the moment the cap went in, because
its fixtures share the same shape as the bad data.

**Decision:** Keep the cap — it is correct given a correct column, and it leaves every pinned
partial-return number untouched — and repair the column first (ADR-05). QUICK returns, which
have no original, keep the uncapped behaviour.
**Consequences:** UOW-03 now depends on UOW-05, so the return work cannot ship into an
environment whose data has not been repaired. The cap stays a one-way guard: it can never
reverse more than was earned and makes no attempt to detect an under-earn. Re-confirmed as
A-02 by Akenzy, 2026-08-19.
**Status:** accepted

### ADR-05 — Repair `points_earned` by migration, not by an ops script
**Context:** ADR-02's cap is only safe once `invoices.points_earned` is trustworthy. The
affected set is bounded and identifiable — `points_earned = 0` with a positive
`point_history` earn — and for all 24 such rows the ledger earn equals
`floor(amount_due / 10000)` exactly, so two independent sources agree on every value the
repair would write (A-11). The repo has both conventions available: one-off scripts in
`apps/api/scripts/`, and TypeORM migrations in `apps/api/src/database/migrations/`.
**Decision:** A TypeORM migration. The ordering constraint is the deciding factor: the cap
must never reach an environment before the repair has run there, and a migration is the only
mechanism that guarantees that automatically per environment. An ops script relies on someone
remembering.
**Consequences:** A data-writing migration, which is an established pattern here — 17 of the
157 migrations write data, and `1788000000001-ZeroWalkInInvoicePointsEarned` is a direct
precedent on this very column. (An earlier draft of this ADR asserted the repo had never done
this; that was wrong and is corrected here rather than quietly dropped.) It writes only where
the column is empty and the ledger is not, so
the 3 inverse rows (A-12, Finding C) are never touched, and `down()` can restore the previous
values exactly because they were all 0. Production may hold more such rows than the clone; the
migration is written to find them rather than to a fixed list, so that is handled rather than
assumed away.
**Status:** accepted

### ADR-03 — `points_balance_after` is projected from persisted columns, never from pre-gate totals
**Context:** #15 is the column drifting from the values on its own row: line 73 gates the
earn, line 86 projects from the ungated total. The v1 site and the return site have the same
shape and are correct only by accident of their local variable names.
**Decision:** Every write of `points_balance_after` reads `invoice.pointsEarned`,
`invoice.pointsReversed`, `invoice.pointsRedeemed` — never `totals.*` or a local pre-gate
variable. All three sites carry a comment saying so and a spec proving the blocked case.
**Consequences:** A rule a reviewer can check by eye. It does not stop a fourth site from
being written wrong, which is why the proof is a per-site spec rather than a shared helper —
a helper would hide the very coupling this ADR is trying to keep visible.
**Status:** accepted

### ADR-04 — Assess the damage before designing any remediation
**Context:** #16 really debited customer cards, and #15 really wrote wrong snapshots onto
printed invoices. Whether those rows are dev-test noise or real customer data is unknown, and
the answer changes whether a remediation is worth writing at all.
**Decision:** This feature ships a read-only assessment (US-04) that counts the affected rows
and recommends. It ships no data change. If remediation follows, it corrects by
`point_history` ADJUST entry — posted transactions are immutable, so no row is edited.
**Consequences:** The fix-forward lands without waiting on a data decision, and the decision
is made on numbers rather than on a guess. Cost is one extra slice.
**Status:** accepted
