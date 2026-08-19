-- Impact assessment for QA defects #15 and #16 (promotion-points-reverse-defects, T-04-01).
--
-- READ-ONLY. Contains SELECTs and nothing else. Intended for `erp_clone_prod` on
-- localhost:5433 — a clone of production, so treat it as production data.
--
--   PGPASSWORD=erp_secret psql -h localhost -p 5433 -U erp_user -d erp_clone_prod \
--     -f apps/api/scripts/assess-points-reverse-damage.sql
--
-- What the two defects were:
--   #15  persist-invoice.step.ts projected `points_balance_after` from the raw
--        `totals.pointsEarned` instead of the gated `invoice.pointsEarned`, so an invoice
--        whose accrual a promotion had blocked still added floor(amount_due / 10000) to
--        the printed balance.
--   #16  cancel-invoice.service.ts published the amount due and let the reverse consumer
--        re-derive points from it, so cancelling such an invoice really debited the card
--        by points it had never accrued.
--
-- organizations.id is uuid while invoices.organization_id / membership_cards.organization_id
-- are varchar, so every join to organizations needs an explicit ::text cast. Without it
-- Postgres raises "operator does not exist: uuid = character varying".
--
-- 10000 is POINT_EARN_VND_PER_POINT (apps/api/src/modules/customer/loyalty.constants.ts).

\echo ''
\echo '=== 0. Snapshot date of this clone ==========================================='
\echo 'Every count below is as of this date, not as of now.'

SELECT max(created_at) AS newest_invoice,
       max(cancelled_at) AS newest_cancellation,
       count(*) AS total_invoices
FROM invoices;

\echo ''
\echo '=== 0b. Can this database contain #15/#16 damage at all? ====================='
\echo 'Both defects were introduced by promotion-scope-points-toggle, which shipped the'
\echo '`accrue_points` column. Without that column there is no way to block accrual, so'
\echo 'no invoice can have moved money while earning nothing, and neither defect can'
\echo 'have occurred. Check this BEFORE reading anything below: if it says NO, every'
\echo 'count in section 1 and 2 is something else.'

SELECT CASE WHEN count(*) > 0 THEN 'YES — accrue_points exists, damage is possible'
            ELSE 'NO — accrue_points absent, this database predates the defects'
       END AS can_contain_damage
FROM information_schema.columns
WHERE table_name = 'promotion_programs' AND column_name = 'accrue_points';

\echo ''
\echo '=== 1. Defect #16 — points clawed back that were never accrued ==============='
\echo 'An ADJUST row with delta < 0 against a document that records points_reversed = 0:'
\echo 'the document says it reversed nothing, the ledger says it took points.'
\echo ''
\echo 'The ADJUST type filter is load-bearing. Without it this also catches redeem rows:'
\echo 'points the customer legitimately spent at checkout, negative by design and nothing'
\echo 'to do with reversal. Dropping that filter overstated the count by 10 rows and'
\echo '1.149 points on the clone.'
\echo ''
\echo 'If 0b said NO, rows here are NOT #16. They are the same symptom from an older'
\echo 'cause and belong in their own ticket.'

SELECT o.name                       AS organization,
       count(*)                     AS bad_rows,
       sum(-ph.delta)               AS points_destroyed,
       min(ph.created_at)::date     AS first_seen,
       max(ph.created_at)::date     AS last_seen
FROM point_history ph
JOIN invoices i ON i.id = ph.invoice_id
JOIN organizations o ON o.id::text = i.organization_id
WHERE ph.delta < 0
  AND ph.type = 'adjust'
  AND i.points_reversed = 0
GROUP BY o.name
ORDER BY points_destroyed DESC;

\echo ''
\echo '--- 1b. The same rows, itemised — this is the input a remediation would need ---'

SELECT o.name            AS organization,
       i.code            AS invoice_code,
       i.type            AS invoice_type,
       i.status          AS invoice_status,
       i.customer_id,
       mc.card_number,
       mc.points         AS card_points_now,
       -ph.delta         AS points_destroyed,
       i.amount_due,
       i.points_earned,
       i.points_reversed,
       ph.created_at     AS destroyed_at
FROM point_history ph
JOIN invoices i ON i.id = ph.invoice_id
JOIN organizations o ON o.id::text = i.organization_id
LEFT JOIN membership_cards mc ON mc.id = ph.card_id
WHERE ph.delta < 0
  AND ph.type = 'adjust'
  AND i.points_reversed = 0
ORDER BY ph.created_at DESC;

\echo ''
\echo '--- 1c. Wider drift check: ledger disagrees with the document, either way ------'
\echo 'Supplementary, not part of #16. A legitimate cause exists — the consumer clamps'
\echo 'its decrement at the available balance and logs a warning when it does — so read'
\echo 'this as "worth a look", not as damage.'

SELECT o.name                            AS organization,
       count(*)                          AS documents,
       sum(abs(ph.delta) - i.points_reversed) AS net_drift
FROM point_history ph
JOIN invoices i ON i.id = ph.invoice_id
JOIN organizations o ON o.id::text = i.organization_id
WHERE ph.delta < 0
  AND ph.type = 'adjust'
  AND abs(ph.delta) <> i.points_reversed
GROUP BY o.name
ORDER BY documents DESC;

\echo ''
\echo '=== 2. Defect #15 — inflated points_balance_after ============================'
\echo 'A SALE with a customer attached, a projected balance, points_earned = 0, and an'
\echo 'amount large enough to have earned at least one point. Under the v2 saga the only'
\echo 'way to reach that state is a promotion blocking accrual — in which case the'
\echo 'projection was inflated by exactly floor(amount_due / 10000).'
\echo ''
\echo 'What this query does NOT catch, stated plainly:'
\echo '  * Invoices under 10.000d. floor() gives 0 either way, so there was no inflation'
\echo '    and nothing to find.'
\echo '  * Invoices later cancelled: cancel-invoice.service rewrites points_balance_after'
\echo '    from points_reversed, so the checkout-time inflation is overwritten and'
\echo '    invisible here. The `status` column below shows which rows those are.'
\echo '  * v1 checkout invoices. v1 has no pointsBlocked at all, so points_earned always'
\echo '    equals floor(amount_due / 10000) there and no v1 row can match. That is a'
\echo '    separate, still-unfixed gap, not a false negative of this query.'

SELECT o.name                                AS organization,
       i.status,
       count(*)                              AS invoices,
       sum(floor(i.amount_due / 10000))      AS points_over_reported,
       min(i.issued_at)::date                AS first_seen,
       max(i.issued_at)::date                AS last_seen
FROM invoices i
JOIN organizations o ON o.id::text = i.organization_id
WHERE i.type = 'SALE'
  AND i.customer_id IS NOT NULL
  AND i.points_balance_after IS NOT NULL
  AND i.points_earned = 0
  AND floor(i.amount_due / 10000) > 0
GROUP BY o.name, i.status
ORDER BY points_over_reported DESC;

\echo ''
\echo '--- 2b. The same invoices, itemised -------------------------------------------'

SELECT o.name                           AS organization,
       i.code                           AS invoice_code,
       i.status,
       i.issued_at::date                AS issued,
       i.amount_due,
       i.points_earned,
       i.points_redeemed,
       i.points_balance_after           AS printed_balance,
       floor(i.amount_due / 10000)      AS over_reported_by,
       i.points_balance_after - floor(i.amount_due / 10000) AS true_balance_at_the_time
FROM invoices i
JOIN organizations o ON o.id::text = i.organization_id
WHERE i.type = 'SALE'
  AND i.customer_id IS NOT NULL
  AND i.points_balance_after IS NOT NULL
  AND i.points_earned = 0
  AND floor(i.amount_due / 10000) > 0
ORDER BY i.issued_at DESC;

\echo ''
\echo '=== 3. Which organizations are real, and which are demo/test ================='
\echo 'The recommendation turns on this: dev-test rows mean fix-forward, real customer'
\echo 'cards mean a remediation is worth writing.'

SELECT o.name                    AS organization,
       count(DISTINCT i.id)      AS invoices,
       count(DISTINCT i.customer_id) AS customers,
       count(DISTINCT mc.id)     AS cards,
       min(i.created_at)::date   AS first_invoice,
       max(i.created_at)::date   AS last_invoice
FROM organizations o
LEFT JOIN invoices i ON i.organization_id = o.id::text
LEFT JOIN membership_cards mc ON mc.organization_id = o.id::text
GROUP BY o.name
ORDER BY invoices DESC;

\echo ''
\echo '=== 4. Does points_earned agree with the ledger? ============================='
\echo 'The earn is written in two places by two different code paths -- the column on'
\echo 'the invoice, and an earn row in point_history -- and either can miss.'
\echo ''
\echo 'Direction matters, so they are reported separately:'
\echo '  column-empty : the column was never populated while the card really was'
\echo '                 credited. Repaired by BackfillInvoicePointsEarnedFromLedger.'
\echo '                 The return cap reads this column, so a row here means a'
\echo '                 legitimate reversal would be silently refused.'
\echo '  ledger-empty : the column is right and the card was never credited. The'
\echo '                 customer is short the points their invoice claims. Not fixed'
\echo '                 by the backfill and not fixed by this feature.'
\echo ''
\echo 'Scope is posted customer SALEs, matching the baseline these numbers were first'
\echo 'measured against.'

WITH earn AS (
  SELECT i."id",
         i."code",
         i."issued_at",
         i."points_earned",
         coalesce(sum(ph."delta") FILTER (WHERE ph."type" = 'earn'), 0)::int AS ledger_earn
  FROM "invoices" i
  LEFT JOIN "point_history" ph ON ph."invoice_id" = i."id"
  WHERE i."type" = 'SALE'
    AND i."customer_id" IS NOT NULL
    AND i."issued_at" IS NOT NULL
  GROUP BY i."id"
)
SELECT 'agree'         AS direction, count(*) AS invoices, 0 AS points_at_stake
FROM earn WHERE "points_earned" = ledger_earn
UNION ALL
SELECT 'column-empty', count(*), coalesce(sum(ledger_earn), 0)::int
FROM earn WHERE "points_earned" = 0 AND ledger_earn > 0
UNION ALL
SELECT 'ledger-empty', count(*), coalesce(sum("points_earned"), 0)::int
FROM earn WHERE "points_earned" > 0 AND ledger_earn = 0;

\echo ''
\echo '--- 4b. The ledger-empty rows, itemised: customers who were never credited ----'

WITH earn AS (
  SELECT i."id",
         i."code",
         i."issued_at",
         i."customer_id",
         i."amount_due",
         i."points_earned",
         coalesce(sum(ph."delta") FILTER (WHERE ph."type" = 'earn'), 0)::int AS ledger_earn
  FROM "invoices" i
  LEFT JOIN "point_history" ph ON ph."invoice_id" = i."id"
  WHERE i."type" = 'SALE'
    AND i."customer_id" IS NOT NULL
    AND i."issued_at" IS NOT NULL
  GROUP BY i."id"
)
SELECT "code", "issued_at"::date AS issued, "amount_due", "points_earned" AS owed, "customer_id"
FROM earn
WHERE "points_earned" > 0 AND ledger_earn = 0
ORDER BY "points_earned" DESC;
