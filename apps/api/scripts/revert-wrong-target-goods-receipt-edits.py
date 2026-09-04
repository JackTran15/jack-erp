#!/usr/bin/env python3
"""
Revert goods-receipt edits that landed on the wrong voucher.

Bug report (30/08): "Sửa phiếu nhập, bị sửa data của phiếu khác, thay vì phiếu
vừa mở dialog để sửa" — the edit dialog saved against a stale receipt id, so the
revision was applied to a receipt the user never opened. On 2026-08-30 this hit
three initial-stock receipts (NK000236 Vĩnh Long, NK000231 + NK000230 Huế) and
pushed two stock balances negative.

GoodsReceiptService.update() writes four things per revision:
  1. deletes + re-inserts every goods_receipt_lines row of the receipt,
  2. one ADJUSTMENT_INCREASE/DECREASE stock_ledger_entries row per changed
     (item, location) delta,
  3. the matching stock_balances.quantity move,
  4. goods_receipts.revision += 1.
This script undoes 1-3 by replaying the inverse delta as a NEW revision — it
does not delete the bad ledger rows. The wrong edit and its reversal both stay
on the books, which is what "business transactions are immutable after posting"
requires, and it leaves the invariant the service relies on intact:

    sum(goods_receipt_lines.quantity) == sum(stock_ledger_entries.quantity)
    per (receipt, item, location)

That invariant is re-checked inside the transaction against a pre-window
snapshot; any mismatch aborts the whole thing.

Out of scope: credit/cash settlement deltas (applyCreditDelta / applyCashDelta)
and the transfer-order leg cascade. The script refuses to run on any receipt
that has a payment_method or a STOCK_TRANSFER reference, because reverting the
stock side alone would leave supplier debt or the export leg out of step.

Uses only the stdlib; talks to Postgres through the `psql` client.

Usage:
  python3 apps/api/scripts/revert-wrong-target-goods-receipt-edits.py
    --> dry run: prints every delta it would undo, writes nothing.

  python3 apps/api/scripts/revert-wrong-target-goods-receipt-edits.py --rehearse
    --> runs the full transaction, prints the resulting balances, then ROLLS
        BACK. Nothing is written; use it to prove the SQL and the in-transaction
        verification pass against real data before touching the books.

  python3 apps/api/scripts/revert-wrong-target-goods-receipt-edits.py --apply
    --> writes the backup, then commits the revert in one transaction.

Scoping (default = every goods-receipt adjustment written since midnight UTC):
  --since=2026-08-30            start of the window, inclusive (any timestamp
                                literal Postgres accepts; default today 00:00 UTC)
  --until=2026-08-31            end of the window, exclusive (default: now)
  --receipt=<uuid>              restrict to this receipt; repeatable
  --actor=<id>                  created_by stamped on the reversal rows
                                (default: the actor who made the bad edit)
  --backup=<path>               backup file (default ./revert-wrong-edit-<ts>.json)

Connection env vars:
  DB_HOST=localhost DB_PORT=5433 DB_NAME=prod_3008 DB_USER=erp_user DB_PASS=erp_secret
"""

import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": os.environ.get("DB_PORT", "5433"),
    "name": os.environ.get("DB_NAME", "prod_3008"),
    "user": os.environ.get("DB_USER", "erp_user"),
    "password": os.environ.get("DB_PASS", "erp_secret"),
}

# Only these two movement types are written by an edit; a PURCHASE_RECEIPT row
# is the original posting and must never be touched. cancel() writes
# ADJUSTMENT_DECREASE against the same reference_type, so the movement type
# alone is NOT enough to isolate edits — the notes prefix is what separates
# `Adjustment for <doc> rev N` (update) from `Huỷ phiếu nhập kho <doc>` (cancel).
EDIT_MOVEMENTS = "('ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE')"
EDIT_NOTES = "notes LIKE 'Adjustment for % rev %'"


def run_psql(sql: str, tuples_only: bool = False) -> str:
    """Run one SQL string through psql. Raises on any SQL error."""
    cmd = [
        "psql",
        "-h", DB["host"],
        "-p", DB["port"],
        "-U", DB["user"],
        "-d", DB["name"],
        "-X",                       # ignore ~/.psqlrc
        "-v", "ON_ERROR_STOP=1",
        "-q",
    ]
    if tuples_only:
        cmd += ["-t", "-A"]
    env = dict(os.environ, PGPASSWORD=DB["password"])
    proc = subprocess.run(cmd, input=sql, env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout + proc.stderr)
        raise SystemExit(f"psql failed (exit {proc.returncode})")
    return proc.stdout.strip()


def query(sql: str):
    """Run a SELECT and return rows as a list of dicts."""
    wrapped = f"SELECT coalesce(json_agg(t), '[]'::json) FROM ({sql}) t;"
    return json.loads(run_psql(wrapped, tuples_only=True))


def parse_args():
    apply_mode = "--apply" in sys.argv
    rehearse = "--rehearse" in sys.argv
    if apply_mode and rehearse:
        raise SystemExit("--apply and --rehearse are mutually exclusive")
    opts = {"receipt": []}
    for arg in sys.argv[1:]:
        if arg in ("--apply", "--rehearse"):
            continue
        match = re.fullmatch(r"--(since|until|receipt|actor|backup)=(.+)", arg)
        if not match:
            raise SystemExit(f"Unrecognised argument: {arg}\n\n{__doc__}")
        key, value = match.group(1), match.group(2)
        if key == "receipt":
            uuid.UUID(value)          # reject anything not a UUID before interpolating
            opts["receipt"].append(value)
        else:
            opts[key] = value
    for key in ("since", "until"):
        # Timestamps go straight into SQL, so allow only date/time characters.
        if key in opts and not re.fullmatch(r"[0-9 :.+\-TZ]+", opts[key]):
            raise SystemExit(f"--{key} must be a plain timestamp literal")
    for key in ("actor", "backup"):
        if key in opts and not re.fullmatch(r"[\w@.\-/]+", opts[key]):
            raise SystemExit(f"--{key} contains unsupported characters")
    return apply_mode, rehearse, opts


def build_scope(opts) -> str:
    """WHERE clause over stock_ledger_entries selecting the bad edit rows."""
    since = f"'{opts['since']}'::timestamp" if "since" in opts else "date_trunc('day', now() AT TIME ZONE 'UTC')"
    until = f"'{opts['until']}'::timestamp" if "until" in opts else "(now() AT TIME ZONE 'UTC')"
    parts = [
        "reference_type = 'GOODS_RECEIPT'",
        f"movement_type IN {EDIT_MOVEMENTS}",
        EDIT_NOTES,
        f"created_at >= {since}",
        f"created_at < {until}",
    ]
    if opts["receipt"]:
        ids = ", ".join(f"'{r}'::uuid" for r in opts["receipt"])
        parts.append(f"reference_id IN ({ids})")
    return " AND ".join(parts), since


# The bad edit rows, netted per (receipt, item, location). `restore_delta` is
# what has to be added back; `bad_delta` is what the wrong edit took away.
def restore_cte(scope: str) -> str:
    return f"""
        bad AS (
            SELECT * FROM stock_ledger_entries WHERE {scope}
        ),
        restore AS (
            SELECT reference_id                       AS receipt_id,
                   organization_id,
                   branch_id,
                   item_id,
                   location_id,
                   -sum(quantity)                     AS restore_delta,
                   sum(quantity)                      AS bad_delta,
                   max(unit_cost)                     AS unit_cost,
                   count(DISTINCT unit_cost)          AS cost_variants,
                   count(DISTINCT created_at)         AS edit_events,
                   max(created_by)                    AS bad_actor
            FROM bad
            GROUP BY 1, 2, 3, 4, 5
            HAVING sum(quantity) <> 0
        )
    """


def main():
    apply_mode, rehearse, opts = parse_args()
    scope, since = build_scope(opts)
    cte = restore_cte(scope)

    print(
        f"Connected: {DB['user']}@{DB['host']}:{DB['port']}/{DB['name']} "
        f"({'APPLY' if apply_mode else 'REHEARSE (rollback)' if rehearse else 'DRY RUN'})"
    )
    print(f"Scope: {scope}\n")

    rows = query(f"""
        WITH {cte}
        SELECT gr.document_number,
               b.name                       AS branch,
               it.code                      AS item_code,
               it.name                      AS item_name,
               lo.name                      AS location,
               r.bad_delta::float           AS bad_delta,
               r.restore_delta::float       AS restore_delta,
               r.cost_variants,
               sb.quantity::float           AS balance_now,
               (sb.quantity + r.restore_delta)::float AS balance_after,
               (sb.id IS NULL)              AS balance_missing
        FROM restore r
        JOIN goods_receipts gr ON gr.id = r.receipt_id
        LEFT JOIN branches b ON b.id::text = gr.branch_id
        LEFT JOIN items it ON it.id = r.item_id
        LEFT JOIN locations lo ON lo.id = r.location_id
        LEFT JOIN stock_balances sb
               ON sb.organization_id = r.organization_id
              AND sb.item_id = r.item_id
              AND sb.location_id = r.location_id
        ORDER BY gr.document_number, it.code
    """)

    if not rows:
        print("No goods-receipt edit adjustments in scope. Nothing to revert.")
        return

    receipts = query(f"""
        WITH {cte}
        SELECT DISTINCT gr.id::text        AS id,
               gr.document_number,
               gr.status::text             AS status,
               coalesce(gr.revision, 0)    AS revision,
               gr.payment_method::text     AS payment_method,
               gr.reference_type::text     AS reference_type,
               b.name                      AS branch,
               (SELECT max(created_at)::text FROM bad WHERE reference_id = gr.id) AS edited_at
        FROM restore r
        JOIN goods_receipts gr ON gr.id = r.receipt_id
        LEFT JOIN branches b ON b.id::text = gr.branch_id
        ORDER BY gr.document_number
    """)

    print(f"{len(rows)} delta(s) to undo across {len(receipts)} receipt(s):\n")
    current_doc = None
    for r in rows:
        if r["document_number"] != current_doc:
            current_doc = r["document_number"]
            head = next(x for x in receipts if x["document_number"] == current_doc)
            print(
                f"  {current_doc}  [{head['branch']}]  status={head['status']} "
                f"rev={head['revision']} -> {head['revision'] + 1}  "
                f"edited_at={head['edited_at']}"
            )
        balance = (
            "balance row MISSING" if r["balance_missing"]
            else f"balance {r['balance_now']:g} -> {r['balance_after']:g}"
        )
        print(
            f"      {r['item_code']:<12} @ {r['location'] or '?':<10} "
            f"wrong edit {r['bad_delta']:+g}, restore {r['restore_delta']:+g}   {balance}"
        )
    print()

    # Guards. Each of these makes the mechanical revert unsafe, so refuse the
    # whole run rather than half-fixing the books.
    blockers = []
    settled = [r for r in receipts if r["payment_method"]]
    if settled:
        blockers.append(
            "settled receipts (payment_method set — supplier debt / cash entries "
            "would also need reversing): "
            + ", ".join(r["document_number"] for r in settled)
        )
    transfers = [r for r in receipts if r["reference_type"] == "STOCK_TRANSFER"]
    if transfers:
        blockers.append(
            "transfer-order legs (the export leg was cascaded too): "
            + ", ".join(r["document_number"] for r in transfers)
        )
    editable = [r for r in receipts if r["status"] not in ("POSTED", "DRAFT")]
    if editable:
        blockers.append(
            "receipts no longer editable: "
            + ", ".join(f"{r['document_number']}={r['status']}" for r in editable)
        )
    ambiguous = [r for r in rows if r["cost_variants"] > 1]
    if ambiguous:
        blockers.append(
            "deltas written at more than one unit_cost (cannot pick a restore price): "
            + ", ".join(f"{r['document_number']}/{r['item_code']}" for r in ambiguous)
        )
    missing = [r for r in rows if r["balance_missing"]]
    if missing:
        blockers.append(
            "no stock_balances row for: "
            + ", ".join(f"{r['document_number']}/{r['item_code']}" for r in missing)
        )
    if blockers:
        print("REFUSING TO APPLY — out of this script's scope:")
        for b in blockers:
            print(f"  - {b}")
        print("\nRe-run with --receipt=<uuid> to exclude them, or fix those by hand.")
        raise SystemExit(1)

    still_negative = [r for r in rows if r["balance_after"] < 0]
    if still_negative:
        print("Note: these balances stay negative after the revert (another cause):")
        for r in still_negative:
            print(f"  {r['document_number']}/{r['item_code']}: {r['balance_after']:g}")
        print()

    if not apply_mode and not rehearse:
        print("Dry run only — nothing written. Re-run with --apply to commit.")
        return

    if rehearse:
        backup_path = None
        print("Rehearsal: the transaction below ends in ROLLBACK, no backup needed.\n")
    else:
        backup_path = opts.get(
            "backup",
            f"revert-wrong-edit-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json",
        )
        backup = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "database": f"{DB['host']}:{DB['port']}/{DB['name']}",
            "scope": scope,
            "receipts": receipts,
            "deltas": rows,
            "bad_ledger_rows": query(f"""
                SELECT id, organization_id, branch_id, item_id, location_id,
                       movement_type::text AS movement_type, quantity::float,
                       reference_type, reference_id, notes, posted_at::text,
                       created_at::text, created_by, unit_cost::float, line_value::float
                FROM stock_ledger_entries WHERE {scope}
            """),
            "lines_before": query(f"""
                WITH {cte}
                SELECT l.id, l.goods_receipt_id, l.item_id, l.location_id, l.uom_code,
                       l.quantity::float, l.unit_price::float, l.line_total::float,
                       l.note, l.created_at::text, l.created_by
                FROM goods_receipt_lines l
                WHERE l.goods_receipt_id IN (SELECT DISTINCT receipt_id FROM restore)
            """),
            "balances_before": query(f"""
                WITH {cte}
                SELECT sb.id, sb.organization_id, sb.branch_id, sb.item_id, sb.location_id,
                       sb.quantity::float, sb.last_movement_at::text, sb.updated_at::text
                FROM stock_balances sb
                JOIN restore r ON r.organization_id = sb.organization_id
                              AND r.item_id = sb.item_id
                              AND r.location_id = sb.location_id
            """),
        }
        with open(backup_path, "w", encoding="utf-8") as fh:
            json.dump(backup, fh, ensure_ascii=False, indent=2)
        print(
            f"Backed up {len(backup['bad_ledger_rows'])} ledger row(s), "
            f"{len(backup['lines_before'])} receipt line(s) and "
            f"{len(backup['balances_before'])} balance(s) to {backup_path}\n"
        )

    actor = f"'{opts['actor']}'" if "actor" in opts else "r.bad_actor"
    end_stmt = "ROLLBACK" if rehearse else "COMMIT"

    output = run_psql(f"""
        BEGIN;

        -- Take the working set once so later statements cannot see it shift.
        CREATE TEMP TABLE _restore ON COMMIT DROP AS
          WITH {cte} SELECT * FROM restore;

        -- Lock every receipt for the whole transaction, the same way
        -- GoodsReceiptService.update() does, so a concurrent edit cannot diff
        -- against lines this script is in the middle of rewriting.
        DO $$ BEGIN
          PERFORM 1 FROM goods_receipts
           WHERE id IN (SELECT DISTINCT receipt_id FROM _restore) FOR UPDATE;
        END $$;

        -- The state to land on: the receipt's ledger position as it stood
        -- before the window, i.e. the original posting plus every earlier,
        -- legitimate revision.
        CREATE TEMP TABLE _expected ON COMMIT DROP AS
          SELECT reference_id AS receipt_id, item_id, location_id, sum(quantity) AS quantity
          FROM stock_ledger_entries
          WHERE reference_type = 'GOODS_RECEIPT'
            AND reference_id IN (SELECT DISTINCT receipt_id FROM _restore)
            AND created_at < {since}
          GROUP BY 1, 2, 3;

        -- 1. put the quantity back on lines that survived the wrong edit
        UPDATE goods_receipt_lines l
        SET quantity   = l.quantity + r.restore_delta,
            line_total = round((l.quantity + r.restore_delta) * l.unit_price, 2),
            updated_at = now()
        FROM _restore r
        WHERE l.goods_receipt_id = r.receipt_id
          AND l.item_id = r.item_id
          AND l.location_id = r.location_id;

        -- 2. re-create the lines the wrong edit deleted outright. uom_code and
        --    branch come from the item / receipt because the deleted rows are
        --    gone; unit_price is the cost the ledger recorded for that delta.
        INSERT INTO goods_receipt_lines (
            organization_id, branch_id, goods_receipt_id, item_id, location_id,
            uom_code, quantity, unit_price, line_total, created_by
        )
        SELECT r.organization_id, gr.branch_id, r.receipt_id, r.item_id, r.location_id,
               it.unit, r.restore_delta, r.unit_cost,
               round(r.restore_delta * r.unit_cost, 2), {actor}
        FROM _restore r
        JOIN goods_receipts gr ON gr.id = r.receipt_id
        JOIN items it ON it.id = r.item_id
        WHERE r.restore_delta > 0
          AND NOT EXISTS (
              SELECT 1 FROM goods_receipt_lines l
              WHERE l.goods_receipt_id = r.receipt_id
                AND l.item_id = r.item_id
                AND l.location_id = r.location_id
          );

        -- 3. a line the wrong edit *added* nets to zero once undone — drop it
        DELETE FROM goods_receipt_lines l
        USING _restore r
        WHERE l.goods_receipt_id = r.receipt_id
          AND l.item_id = r.item_id
          AND l.location_id = r.location_id
          AND l.quantity = 0;

        -- 4. the reversal itself: a normal next revision on the ledger, not a
        --    delete of the bad rows
        INSERT INTO stock_ledger_entries (
            organization_id, branch_id, created_by, item_id, location_id,
            movement_type, quantity, reference_type, reference_id, notes,
            posted_at, unit_cost, line_value
        )
        SELECT r.organization_id, r.branch_id, {actor}, r.item_id, r.location_id,
               (CASE WHEN r.restore_delta > 0 THEN 'ADJUSTMENT_INCREASE'
                     ELSE 'ADJUSTMENT_DECREASE' END)::stock_ledger_entries_movement_type_enum,
               r.restore_delta, 'GOODS_RECEIPT', r.receipt_id,
               'Adjustment for ' || coalesce(gr.document_number, gr.id::text)
                 || ' rev ' || (coalesce(gr.revision, 0) + 1)
                 || ' (revert wrong-target edit)',
               now(), r.unit_cost, round(r.restore_delta * r.unit_cost, 2)
        FROM _restore r
        JOIN goods_receipts gr ON gr.id = r.receipt_id;

        -- 5. move the balances by the same delta
        UPDATE stock_balances sb
        SET quantity         = sb.quantity + agg.d,
            last_movement_at = now(),
            updated_at       = now()
        FROM (
            SELECT organization_id, item_id, location_id, sum(restore_delta) AS d
            FROM _restore GROUP BY 1, 2, 3
        ) agg
        WHERE sb.organization_id = agg.organization_id
          AND sb.item_id = agg.item_id
          AND sb.location_id = agg.location_id;

        -- 6. the revert is a revision like any other
        UPDATE goods_receipts
        SET revision = coalesce(revision, 0) + 1,
            updated_at = now()
        WHERE id IN (SELECT DISTINCT receipt_id FROM _restore);

        -- 7. verify, or roll the whole thing back
        DO $$
        DECLARE bad_pairs int; bad_balances int;
        BEGIN
          -- every affected receipt is back to its pre-window line-up ...
          SELECT count(*) INTO bad_pairs
          FROM (
            SELECT coalesce(e.receipt_id, l.goods_receipt_id) AS receipt_id
            FROM _expected e
            FULL OUTER JOIN (
              SELECT goods_receipt_id, item_id, location_id, sum(quantity) AS quantity
              FROM goods_receipt_lines
              WHERE goods_receipt_id IN (SELECT DISTINCT receipt_id FROM _restore)
              GROUP BY 1, 2, 3
            ) l ON l.goods_receipt_id = e.receipt_id
               AND l.item_id = e.item_id
               AND l.location_id = e.location_id
            WHERE coalesce(e.quantity, 0) <> coalesce(l.quantity, 0)
          ) diff;
          IF bad_pairs > 0 THEN
            RAISE EXCEPTION
              'Aborting: % (item, location) pair(s) do not match the pre-edit state', bad_pairs;
          END IF;

          -- ... and lines still agree with the ledger, the invariant update() keeps
          SELECT count(*) INTO bad_balances
          FROM (
            SELECT 1
            FROM (
              SELECT reference_id AS receipt_id, item_id, location_id, sum(quantity) AS q
              FROM stock_ledger_entries
              WHERE reference_type = 'GOODS_RECEIPT'
                AND reference_id IN (SELECT DISTINCT receipt_id FROM _restore)
              GROUP BY 1, 2, 3
            ) led
            FULL OUTER JOIN (
              SELECT goods_receipt_id AS receipt_id, item_id, location_id, sum(quantity) AS q
              FROM goods_receipt_lines
              WHERE goods_receipt_id IN (SELECT DISTINCT receipt_id FROM _restore)
              GROUP BY 1, 2, 3
            ) lin USING (receipt_id, item_id, location_id)
            WHERE coalesce(led.q, 0) <> coalesce(lin.q, 0)
          ) diff;
          IF bad_balances > 0 THEN
            RAISE EXCEPTION
              'Aborting: % (item, location) pair(s) where lines and ledger disagree', bad_balances;
          END IF;
        END $$;

        -- 8. show the post-write state while the transaction is still open, so a
        --    rehearsal has something to inspect before it rolls back
        \\echo 'Balances after the revert:'
        SELECT it.code AS item, lo.name AS location, sb.quantity
        FROM stock_balances sb
        JOIN (SELECT DISTINCT organization_id, item_id, location_id FROM _restore) r
          ON r.organization_id = sb.organization_id
         AND r.item_id = sb.item_id
         AND r.location_id = sb.location_id
        JOIN items it ON it.id = sb.item_id
        JOIN locations lo ON lo.id = sb.location_id
        ORDER BY it.code;

        {end_stmt};
    """)
    if output:
        print(output)
    total = sum(abs(r["restore_delta"]) for r in rows)
    if rehearse:
        print(
            f"\nRehearsal passed: {len(rows)} delta(s) applied and both verification "
            "checks succeeded, then rolled back. Nothing was written."
        )
        print("Re-run with --apply to commit.")
        return
    print(
        f"Reverted: {len(rows)} delta(s) across {len(receipts)} receipt(s), "
        f"{total:g} unit(s) restored to stock_balances."
    )
    print(f"Backup: {backup_path}")


if __name__ == "__main__":
    main()
