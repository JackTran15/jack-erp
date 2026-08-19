---
id: UOW-02
slug: cancel-reverses-real-points
title: Cancelling a no-accrual invoice takes no points
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-04, AC-05, AC-06]
risk: medium
status: todo
rollback: revert the publisher/consumer/cancel changes together — `points` is an additive optional field, so a consumer rolled back to the money derivation simply ignores it and behaves as it does today
---

# UOW-02 — Cancelling a no-accrual invoice takes no points

Defect #16, and the payload contract (ADR-01) that UOW-03 also rides on. This is the slice
where the reverse side stops deriving points from money.

## Demo script

1. Take the invoice from UOW-01's demo — blocked promotion, 800.000đ, customer on 7.575
   points, `points_earned = 0`.
2. In POS, open Danh sách hoá đơn, find it, cancel it with a reason.
3. Open the customer's point card: the balance still reads **7.575**.
4. Customer detail → point history: **no** −80 row for that invoice. A `delta = 0` ADJUST row
   with the note "Hoàn điểm từ đơn trả (delta = 0)" is expected and correct — it is the
   consumer's replay marker (A-04).
5. In the DB: `points_reversed = 0` on the cancelled invoice.
6. Regression in the same session: sell 800.000đ with **no** promotion (earns 80), then cancel
   it — the card drops by exactly 80 and a −80 row appears, as today.
7. Regression on the redeem side: sell to a customer redeeming 100 points on a blocked
   promotion, then cancel — the 100 redeemed points come back and nothing else moves.

## In scope

- `LoyaltyPointsReversePayload` gains an optional `points`; the consumer prefers it over the
  money derivation and logs which source it used (ADR-01).
- `cancel-invoice.service.ts` publishes `points: invoice.pointsEarned`.
- Consumer spec proving both the new path and the compatibility path.

## Not in scope

- The return path (UOW-03), which consumes this contract but needs its own capping rule.
- Removing `subtotalDelta`. It stays: it is the audit value, the fallback for events already
  in the topic at deploy, and what the existing publisher guard reads.
- Changing the publisher's `subtotalDelta <= 0` refusal. A blocked cancel still moves money,
  so it still publishes — carrying `points: 0`, which is what produces the replay marker.

## Risks

| Risk | Mitigation |
|---|---|
| `points ?? money` cannot distinguish a legitimately old event from a producer that forgot to send the field | Both producers change inside this feature, and each gets a spec asserting the field is present. Named as a consequence in ADR-01 rather than left implicit |
| A partially deployed cluster processes reverse events with the old consumer and the new producer | The old consumer ignores the unknown `points` key and falls back to `subtotalDelta` — its behaviour today, i.e. the bug, but not a crash. Deploy the consumer before the producers |
| Cancel and return both write `loyalty-points-reverse.publisher.ts`-adjacent code | They do not: T-02-01 owns the publisher and consumer, T-03-01 owns only `checkout-return.service.ts`. T-03-01 declares `depends_on: [T-02-01]` so the contract lands first |

## Definition of done

- [x] AC-04, AC-05, AC-06 pass
- [x] Cancelling a blocked invoice writes no `point_history` row with `delta < 0`
- [x] Cancelling an accruing invoice decrements exactly `invoice.points_earned`, unchanged
      from today
- [x] A reverse event with no `points` field still processes via the money fallback
- [x] The consumer log line names the resolved point count and its source
- [ ] Demoed and accepted at gate G4