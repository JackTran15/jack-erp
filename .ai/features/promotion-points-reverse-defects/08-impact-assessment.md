---
feature: promotion-points-reverse-defects
ticket: T-04-02
database: erp_clone_prod (localhost:5433)
snapshot: 2026-08-13
written: 2026-08-19
---

# Impact assessment — QA #15 and #16

Source: `apps/api/scripts/assess-points-reverse-damage.sql`, run against `erp_clone_prod`
on 2026-08-19. Read-only. The clone's newest invoice is **2026-08-13**; every count below is
as of that date, and 202 invoices exist in total.

## Headline

**No row in this database is attributable to #15 or #16.** Both defects require
`promotion_programs.accrue_points`, the column that makes "money moved, nothing earned"
possible. That column **does not exist in this clone** — it shipped with
`promotion-scope-points-toggle` on 2026-08-17, four days after the snapshot. Without it no
invoice can have blocked accrual, so neither defect can have occurred.

| Measure | Count | Points |
|---|---|---|
| #15 — inflated `points_balance_after` | **0** | 0 |
| #16 — points clawed back that were never accrued | **0** | 0 |

The real exposure lives in whatever database QA has been testing against, not here. That
database is not covered by this assessment.

## Recommendation

**Fix forward for #15 and #16; one remediation already done for Finding B.** There is nothing in this database to
remediate, and the defects are four days old — any damage is confined to test runs on the QA
environment, which is disposable. The decision is Akenzy's; this is a recommendation.

Three findings below are *not* #15 or #16. Finding B was repaired because ADR-02's cap
depends on it; **Findings A and C remain open** and each needs its own ticket.

## Finding A — the return path has been under-recording `points_reversed` since July

**22 documents, 1.468 points, 13–21 July 2026.** Every one is a RETURN or EXCHANGE where the
ledger holds a negative `adjust` row — the points really came off the card — while the
document's own `points_reversed` column reads 0.

| Type | Documents | Points taken |
|---|---|---|
| RETURN | 15 | 1.038 |
| EXCHANGE | 7 | 430 |

Same *symptom* as #16 — the document's snapshot disagreeing with what the ledger did — from a
different and older cause. It predates `accrue_points` entirely, so the fix in this feature
does not address it. The points were correctly taken; only the snapshot column is wrong,
which means receipts reprinted for these documents understate what was clawed back.

Concentrated in one customer: card `MCF1071411` accounts for 18 of the 22 rows. Currently
holding 4.541 points. **Still open.**

## Finding B — RESOLVED — `points_earned` was not trustworthy before 2026-07-20, and this broke ADR-02

This is the one that matters for construction, and it was found while implementing T-03-01.

Of **90 posted customer sales** in this database:

| | Count | Points |
|---|---|---|
| `points_earned` agrees with the ledger | 63 | — |
| `points_earned` disagrees in some direction | 27 | — |
| **`points_earned = 0` while the ledger shows a real earn** | **24** | **3.224** |

Worst cases: `INV-202607-00001` (10.500.000đ, column says 0, ledger says 1.050),
`INV-202607-00013` and `-00012` (3.000.000đ each, 300 apiece).

The newest such invoice is **2026-07-19**. `points_earned` was added to `invoices` by
`c9488fab` on 2026-07-16, so rows written during the few days around that deploy never got
the column populated; everything after 2026-07-19 is consistent.

**Why this blocks ADR-02.** That ADR caps the return reversal at
`min(money-derived, originalInvoice.pointsEarned)`. It assumes `points_earned = 0` means
"this invoice earned nothing". For these 24 invoices it means "nobody wrote the column". The
cap would therefore refuse to reverse **3.224 points** across 24 still-returnable July
invoices — replacing "reverses points never earned" with "fails to reverse points that were",
which is the same defect class pointing the other way.

ADR-02 needed revising before T-03-01 could be implemented. G2 was reopened.

**Resolved 2026-08-19** by `BackfillInvoicePointsEarnedFromLedger1789000000000`, which sets
`points_earned` from the ledger wherever the column is empty and the ledger is not:

| Posted customer sales | Before | After |
|---|---|---|
| column agrees with ledger | 63 | **87** |
| column empty, ledger positive | 24 (3.224 pts) | **0** |
| column right, ledger empty | 3 (Finding C) | 3 — untouched, as intended |

`INV-202607-00001` reads 1.050 instead of 0. `down()` was proven exact by reverting all 27
rows and re-applying. Section 4 of the assessment script now reports this split, so the check
is repeatable on any environment rather than living in this document — production's counts are
not the clone's.

ADR-02's cap stands, and UOW-03 depends on UOW-05 so the cap can never reach an environment
this repair has not.

**Scope note.** The 24/3.224 figure above counts posted customer *sales*. The repair in
UOW-05 is not restricted to sales, and finds **27 invoices / 3.439 points** — the extra three
are posted EXCHANGE documents (`RTN-202607-00004`, `-00012`, `-00019`) whose "Mua thêm" goods
genuinely earned 55, 85 and 75 points in the ledger while the column stayed 0. Same defect;
they are included because an exchange can itself be returned later, so its `points_earned`
feeds the same cap.

## What these queries do not measure

- The QA test database, where the actual #15/#16 damage lives.
- Invoices under 10.000đ — `floor()` gives 0 either way, so there was never any inflation.
- Invoices later cancelled: `cancel-invoice.service` rewrites `points_balance_after` from
  `points_reversed`, overwriting any checkout-time inflation before this query could see it.
- v1 checkout invoices, which have no `pointsBlocked` at all and so cannot match the #15
  predicate. Moot in practice — Akenzy confirms all checkout runs v2 — but the query would
  miss them if a build ever fell back to v1, which the code default still permits.
- Whether production holds more pre-2026-07-20 rows than this clone. The clone is a
  point-in-time copy; the counts are a floor, not a ceiling.

## Finding C — three invoices whose points were never actually credited

The inverse of Finding B, and it means neither source is complete on its own:

| Invoice | Issued | Amount due | `points_earned` | Ledger earn |
|---|---|---|---|---|
| `HD-202607-00040` | 2026-07-21 | 10.450.000đ | 1.045 | **0** |
| `HD-202607-00038` | 2026-07-20 | 6.187.500đ | 618 | **0** |
| `HD-202607-00042` | 2026-07-21 | 2.200.000đ | 220 | **0** |

Here the column is right and the ledger is empty — the async award consumer never landed, so
these customers were never credited the **1.883 points** their invoices say they earned. Not
caused by #15 or #16, and not fixed by the UOW-05 backfill, which writes only where the
column is empty and the ledger is not. **Still open** — needs a card credit, not a column
write. Section 4b of the assessment script itemises the three with their customer ids.

Together, B and C say the same thing: the earn is written in two places by two different code
paths, and either can miss. Worth a follow-up that makes one of them derive from the other.

## A-06 resolved

The assumption asked whether the affected data is dev-test or real. **Neither, for #15/#16 —
there is no affected data here at all**, because the clone predates the defects. Findings A
and B, however, are on real production data: this database has a single organization
("My Company"), so there is no demo/real split to make. Both findings concern real customer
cards.
