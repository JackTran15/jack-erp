---
id: UOW-04
slug: impact-assessment
title: The owner can see how many rows these two defects have already corrupted
demoable: true
duration: 1d
depends_on: []
requirements: [US-04]
verifies: [AC-10, AC-11, AC-12]
risk: low
status: todo
rollback: nothing to roll back — the slice is read-only and produces a SQL file and a markdown write-up, no data change
---

# UOW-04 — How much existing data is actually wrong

ADR-04: the fix-forward ships without waiting on a data decision, and the data decision gets
made on numbers instead of a guess. This slice produces the numbers and a recommendation; the
decision itself is Akenzy's, and any remediation that follows is a separate feature.

## Demo script

1. `psql` into `erp_clone_prod` on localhost:5433 (the production clone, per project memory).
2. Run `apps/api/scripts/assess-points-reverse-damage.sql`.
3. Read the three result sets:
   - invoices whose `points_balance_after` disagrees with their own `points_earned`,
     `points_redeemed` and the card history — defect #15's footprint, by organization and
     branch;
   - `point_history` rows with `delta < 0` written against an invoice whose
     `points_earned = 0` — defect #16's footprint, with the total points destroyed;
   - a breakdown separating the demo/test organizations from real ones.
4. Open `.ai/features/promotion-points-reverse-defects/08-impact-assessment.md` and read the
   recommendation — remediate or fix-forward, with the reason.
5. Confirm no row changed: the script contains no `INSERT`, `UPDATE`, `DELETE` or `ALTER`.

## In scope

- A read-only SQL assessment script, committed next to the repo's existing one-off scripts.
- A written assessment with counts, a dev-versus-real split, and a recommendation.

## Not in scope

- **Any remediation.** Deciding is the owner's; executing it is a separate feature. If it
  happens, it corrects by `point_history` ADJUST entry — posted transactions are immutable, so
  no row is edited (ADR-04, and the `00-intent.md` constraint).
- Running anything against production. The clone only.
- Fixing rows in `erp_dev`. Dev data is disposable; if the counts are dev-only the
  recommendation is "none" and this slice ends there.

## Risks

| Risk | Mitigation |
|---|---|
| A script written against a clone gets run against prod by reflex | The file contains only `SELECT`s, and T-04-01's done-when requires a grep proving no write keyword appears in it |
| "Inconsistent `points_balance_after`" is not a single query — redemption, reversal and later returns all move the balance legitimately | T-04-01 defines the predicate narrowly: only invoices where `points_earned = 0` and `points_balance_after > cardBalanceBefore − points_redeemed`. Narrow and explainable beats broad and arguable |
| The clone is a point-in-time copy and may lag the rows QA just created | Report the clone's snapshot date alongside the counts, so the numbers are read as of a date rather than as of now |

## Definition of done

- [x] AC-10, AC-11, AC-12 pass
- [x] The script runs clean on `erp_clone_prod` and contains no write statement
- [x] The write-up gives counts, the dev-versus-real split, the clone's snapshot date, and a
      recommendation with its reason
- [x] The recommendation is stated as a recommendation — the decision is left to the owner
- [ ] Demoed and accepted at gate G4