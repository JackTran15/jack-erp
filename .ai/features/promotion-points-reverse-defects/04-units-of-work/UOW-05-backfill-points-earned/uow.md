---
id: UOW-05
slug: backfill-points-earned
title: Every invoice records the points it actually earned
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-05]
verifies: [AC-13, AC-14]
risk: high
status: todo
rollback: the migration's `down()` restores the previous values exactly — every row it touches had `points_earned = 0`, so reversing is unambiguous
---

# UOW-05 — Every invoice records the points it actually earned

Added 2026-08-19 after G2 was reopened. ADR-02's cap reads `invoices.points_earned` and treats
0 as "earned nothing"; on real data that is often "nobody wrote the column". This slice makes
the column mean what the cap assumes it means.

Highest-risk slice in the feature: it is the only one that writes data, and it writes it to
every environment the migration reaches, production included.

## Demo script

1. Before: `psql erp_clone_prod` and run section 2 of
   `apps/api/scripts/assess-points-reverse-damage.sql`, plus the Finding B query from
   `08-impact-assessment.md` — 27 invoices read `points_earned = 0` against a real
   ledger earn, 3.439 points; `INV-202607-00001` reads 0 against 1.050.
2. Run the migration's dry-run reporting (it logs the rows it will touch before touching them).
3. Confirm the count it reports is 27 and matches the query from step 1.
4. `pnpm migration:run`.
5. After: re-run the Finding B query — 0 rows. `INV-202607-00001` now reads 1.050.
6. Confirm nothing else moved: the 63 already-agreeing invoices are unchanged, and the three
   Finding C invoices (`HD-202607-00038/00040/00042`, column right and ledger empty) still
   read 618 / 1.045 / 220.
7. `pnpm migration:revert` → all 24 return to 0. Re-run to leave the DB repaired.

## In scope

- One TypeORM migration that sets `points_earned` from the summed `point_history` earn rows,
  only where the column is 0 and the ledger is positive.
- Its `down()`, and the logging that makes step 2 and 3 possible.

## Not in scope

- **Finding C** — the three invoices whose column is right and whose ledger is empty, whose
  customers were never credited 1.883 points. Opposite direction, needs a card credit rather
  than a column write, and is not a precondition for the cap. Its own ticket.
- **Finding A** — the 22 return/exchange documents with `points_reversed = 0` against a real
  negative ledger row. Also its own ticket.
- Making the two sources converge so this cannot recur. The right long-term fix, and much
  wider than a defect batch.

## Risks

| Risk | Mitigation |
|---|---|
| A data-writing migration can silently corrupt rows if the predicate is even slightly wrong | 17 of the repo's 157 migrations already write data, and `ZeroWalkInInvoicePointsEarned` is a precedent on this exact column, so the pattern is established rather than novel. The write is narrow (`points_earned = 0 AND ledger earn > 0`), derived per-row rather than from a hard-coded list, and `down()` is exact because every touched row was 0. Rehearsed on `erp_clone_prod` before it goes near production |
| Production may hold more affected rows than the clone's 27 | The migration finds rows by predicate, not by id list, so a larger set is handled. It logs the count it touched, so the real number is on the record |
| The ledger could be wrong too, and the backfill would write wrong numbers | Checked before deciding: for all 24 rows the ledger earn equals `floor(amount_due / 10000)` exactly (A-11). Two independent sources agree on every value written. The ledger is not complete in general — see A-12 — which is why the write is restricted to rows where the column is empty and the ledger is not |
| The cap ships to an environment the migration has not reached | This is the whole reason ADR-05 chose a migration over an ops script, and why UOW-03 declares `depends_on: [UOW-05]` |

## Definition of done

- [x] AC-13, AC-14 pass
- [x] Rehearsed on `erp_clone_prod`: 27 rows updated, 3.439 points, `INV-202607-00001` reads 1.050
- [x] The 63 agreeing invoices and the 3 Finding C invoices are provably untouched
- [x] `down()` returns every touched row to 0, verified by revert-then-rerun
- [x] The migration logs the row count it touched
- [ ] Demoed and accepted at gate G4