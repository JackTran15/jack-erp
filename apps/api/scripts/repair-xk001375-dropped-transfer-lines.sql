-- Repair XK001375 — the two lines its transfer-order sync dropped on 2026-09-23.
--
-- Background: .ai/debug/transfer-leg-location-move-drops-line.md
--   At 2026-09-23 03:21:53 UTC Buôn Ma Thuột edited NK001415 (rev 1) and only moved
--   HPHMT286-D-37 (999 → A09.02) and THU6288-6-K-37 (999 → A22.05). The sync to the
--   export leg keyed the −1/+1 location deltas by item alone, the −1 won, and
--   XK001375 (rev 1) lost both lines and wrote +1 ADJUSTMENT_INCREASE for each at
--   Đà Nẵng Q13.02 / Q10.04 — two pairs of phantom stock at the source branch.
--
-- What this does (one transaction; the ledger stays append-only — the +1 rows are
-- reversed, not deleted):
--   1. Re-inserts the two goods_issue_lines at their original shelf, qty 1, at the
--      price the receipt mirrored (195,000 / 275,000 → issue total 3,250,000).
--   2. Renumbers XK001375's lines to NK001415's order so the two vouchers line up.
--   3. Writes −1 ADJUSTMENT_DECREASE per item at the original shelf, same unit_cost
--      as the rev-1 adjustment, noted "Adjustment for XK001375 rev 2".
--   4. Takes the same −1 off stock_balances.
--   5. Bumps goods_issues.revision 1 → 2 (the app's optimistic lock).
-- No journal entries (goods issues post none) and no Kafka events (no consumer of
-- stock.movement.posted exists in the repo).
--
-- Guarded: aborts unless XK001375 is exactly in the post-bug state (POSTED, rev 1,
-- 11 lines, neither item present, both rev-1 +1 rows present, no rev-2 rows).
-- Re-running after a commit therefore aborts instead of double-applying.
--
-- Dry run (default — ROLLBACK):
--   psql -h <host> -p <port> -U <user> -d <db> -f apps/api/scripts/repair-xk001375-dropped-transfer-lines.sql
-- Apply:
--   psql ... -v commit=1 -f apps/api/scripts/repair-xk001375-dropped-transfer-lines.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE repair_lines ON COMMIT DROP AS
SELECT e.item_id,
       e.location_id,
       e.unit_cost,
       e.organization_id,
       e.branch_id,
       i.code,
       grl.unit_price
FROM goods_issues gi
JOIN stock_ledger_entries e
  ON e.reference_id = gi.id
 AND e.reference_type = 'GOODS_ISSUE'
 AND e.movement_type = 'ADJUSTMENT_INCREASE'
 AND e.notes = 'Adjustment for XK001375 rev 1'
JOIN items i ON i.id = e.item_id
JOIN goods_receipts gr ON gr.document_number = 'NK001415' AND gr.organization_id = gi.organization_id
JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id AND grl.item_id = e.item_id
WHERE gi.document_number = 'XK001375'
  AND i.code IN ('HPHMT286-D-37', 'THU6288-6-K-37');

DO $$
DECLARE
  gi record;
  n_lines int;
  n_present int;
  n_repair int;
  n_rev2 int;
BEGIN
  SELECT id, status, revision INTO gi FROM goods_issues WHERE document_number = 'XK001375' FOR UPDATE;
  IF gi.id IS NULL THEN RAISE EXCEPTION 'XK001375 not found'; END IF;
  IF gi.status <> 'POSTED' OR gi.revision <> 1 THEN
    RAISE EXCEPTION 'XK001375 is % rev %, expected POSTED rev 1 — already repaired or edited again', gi.status, gi.revision;
  END IF;
  SELECT count(*) INTO n_lines FROM goods_issue_lines WHERE goods_issue_id = gi.id;
  SELECT count(*) INTO n_present FROM goods_issue_lines WHERE goods_issue_id = gi.id
    AND item_id IN (SELECT item_id FROM repair_lines);
  SELECT count(*) INTO n_repair FROM repair_lines;
  SELECT count(*) INTO n_rev2 FROM stock_ledger_entries
    WHERE reference_id = gi.id AND notes LIKE 'Adjustment for XK001375 rev 2%';
  IF n_lines <> 11 OR n_present <> 0 OR n_repair <> 2 OR n_rev2 <> 0 THEN
    RAISE EXCEPTION 'Unexpected state: lines=% present=% repair_rows=% rev2_rows=% (expected 11/0/2/0)',
      n_lines, n_present, n_repair, n_rev2;
  END IF;
END $$;

-- 1. Restore the two lines (temporary line_no past the end; step 2 renumbers).
INSERT INTO goods_issue_lines (goods_issue_id, item_id, quantity, unit_price, line_total, location_id, line_no)
SELECT gi.id, r.item_id, 1, r.unit_price, r.unit_price, r.location_id,
       100 + row_number() OVER (ORDER BY r.code)
FROM repair_lines r
CROSS JOIN (SELECT id FROM goods_issues WHERE document_number = 'XK001375') gi;

-- 2. Renumber to NK001415's order. Two passes to stay clear of the unique
--    (goods_issue_id, line_no) index.
UPDATE goods_issue_lines l SET line_no = l.line_no + 1000
FROM goods_issues gi
WHERE gi.id = l.goods_issue_id AND gi.document_number = 'XK001375';

UPDATE goods_issue_lines l SET line_no = grl.line_no
FROM goods_issues gi, goods_receipts gr, goods_receipt_lines grl
WHERE gi.id = l.goods_issue_id AND gi.document_number = 'XK001375'
  AND gr.document_number = 'NK001415' AND gr.organization_id = gi.organization_id
  AND grl.goods_receipt_id = gr.id AND grl.item_id = l.item_id;

-- 3. Reverse the phantom +1 at Đà Nẵng.
INSERT INTO stock_ledger_entries
  (organization_id, branch_id, created_by, item_id, location_id, movement_type,
   quantity, reference_type, reference_id, notes, posted_at, unit_cost, line_value)
SELECT r.organization_id, r.branch_id, gi.created_by, r.item_id, r.location_id,
       'ADJUSTMENT_DECREASE', -1, 'GOODS_ISSUE', gi.id,
       'Adjustment for XK001375 rev 2 (repair: restore lines dropped by rev 1)',
       now(), r.unit_cost, -r.unit_cost
FROM repair_lines r
CROSS JOIN (SELECT id, created_by FROM goods_issues WHERE document_number = 'XK001375') gi;

-- 4. Same −1 on the running balance.
UPDATE stock_balances sb
SET quantity = sb.quantity - 1, last_movement_at = now(), updated_at = now()
FROM repair_lines r
WHERE sb.organization_id = r.organization_id
  AND sb.item_id = r.item_id
  AND sb.location_id = r.location_id;

-- 5. Revision bump.
UPDATE goods_issues SET revision = 2, updated_at = now() WHERE document_number = 'XK001375';

-- Verification: must print 13 / 13 and zero mismatching items.
SELECT
  (SELECT sum(l.quantity) FROM goods_issue_lines l JOIN goods_issues g ON g.id = l.goods_issue_id
    WHERE g.document_number = 'XK001375') AS xk_qty,
  (SELECT sum(l.quantity) FROM goods_receipt_lines l JOIN goods_receipts g ON g.id = l.goods_receipt_id
    WHERE g.document_number = 'NK001415') AS nk_qty,
  (SELECT sum(l.line_total) FROM goods_issue_lines l JOIN goods_issues g ON g.id = l.goods_issue_id
    WHERE g.document_number = 'XK001375') AS xk_total;

SELECT i.code, x.q AS xk, n.q AS nk
FROM (SELECT l.item_id, sum(l.quantity) q FROM goods_issue_lines l JOIN goods_issues g ON g.id = l.goods_issue_id
       WHERE g.document_number = 'XK001375' GROUP BY 1) x
FULL JOIN (SELECT l.item_id, sum(l.quantity) q FROM goods_receipt_lines l JOIN goods_receipts g ON g.id = l.goods_receipt_id
       WHERE g.document_number = 'NK001415' GROUP BY 1) n ON n.item_id = x.item_id
JOIN items i ON i.id = coalesce(x.item_id, n.item_id)
WHERE x.q IS DISTINCT FROM n.q;

SELECT r.code, sum(e.quantity) AS net_ledger_for_xk001375
FROM repair_lines r
JOIN stock_ledger_entries e ON e.item_id = r.item_id AND e.location_id = r.location_id
JOIN goods_issues gi ON gi.id = e.reference_id AND gi.document_number = 'XK001375'
GROUP BY r.code;

\if :{?commit}
COMMIT;
\echo 'XK001375 repaired (COMMITTED).'
\else
ROLLBACK;
\echo 'Dry run only (ROLLED BACK). Re-run with -v commit=1 to apply.'
\endif
