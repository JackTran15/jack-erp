#!/usr/bin/env python3
"""
Revert the writes made by `fix-double-cancelled-goods-receipts.ts --apply`.

That remediation script inserted one ADJUSTMENT_INCREASE ledger row tagged
reference_type='DATA_CORRECTION' per (receipt, item, location) group, and
added the same quantity to stock_balances. Its excess formula
`qty * (reversal_count - 1)` assumes ONE original receipt line per
(item, location); when a goods receipt contains the same item at the same
location on two lines, a double-cancel produces 4 reversal rows and the
script credits 3x the line quantity instead of 2x — over-crediting stock.

This script puts the database back to its exact pre-fix state:
  1. subtracts every DATA_CORRECTION quantity back out of stock_balances,
  2. deletes the DATA_CORRECTION ledger rows,
  3. recomputes stock_balances.last_movement_at from the remaining ledger,
all inside one transaction, after dumping the deleted rows to a JSON backup.

Hard delete (rather than a compensating reversal entry) is deliberate: the
DATA_CORRECTION rows are script output on a restorable clone, and the point of
reverting is a clean slate to re-run a corrected fix. Do NOT use this shape on
real production — there, reverse with new ledger entries instead.

Uses only the stdlib; talks to Postgres through the `psql` client.

Usage:
  python3 apps/api/scripts/revert-double-cancelled-receipt-fix.py
    --> dry run: prints what would be reverted, writes nothing.

  python3 apps/api/scripts/revert-double-cancelled-receipt-fix.py --apply
    --> writes the backup, then commits the revert.

Optional scoping (default = every DATA_CORRECTION row in the database):
  --reference-id=<goods_receipt_uuid>   only corrections for this receipt
  --created-by=<uuid>                   only corrections stamped by this actor
  --backup=<path>                       backup file (default ./revert-backup-<ts>.json)

Connection comes from the same env vars as the TypeScript script:
  DB_HOST=localhost DB_PORT=5433 DB_NAME=erp_clone_prod DB_USER=erp_user DB_PASS=erp_secret
"""

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": os.environ.get("DB_PORT", "5433"),
    "name": os.environ.get("DB_NAME", "erp_dev"),
    "user": os.environ.get("DB_USER", "erp_user"),
    "password": os.environ.get("DB_PASS", "erp_secret"),
}


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
    opts = {}
    for key in ("reference-id", "created-by", "backup"):
        prefix = f"--{key}="
        match = next((a for a in sys.argv if a.startswith(prefix)), None)
        if match:
            opts[key] = match[len(prefix):]
    for key in ("reference-id", "created-by"):
        if key in opts:
            uuid.UUID(opts[key])  # reject anything not a UUID before interpolating
    return apply_mode, opts


def build_scope(opts, alias: str = "") -> str:
    """WHERE clause selecting the fix script's rows. `alias` qualifies the
    columns for queries that join another table carrying the same names."""
    col = f"{alias}." if alias else ""
    parts = [f"{col}reference_type = 'DATA_CORRECTION'"]
    if "reference-id" in opts:
        parts.append(f"{col}reference_id = '{opts['reference-id']}'::uuid")
    if "created-by" in opts:
        parts.append(f"{col}created_by = '{opts['created-by']}'")
    return " AND ".join(parts)


def main():
    apply_mode, opts = parse_args()
    scope = build_scope(opts)
    scope_sle = build_scope(opts, "sle")

    print(
        f"Connected: {DB['host']}:{DB['port']}/{DB['name']} "
        f"({'APPLY' if apply_mode else 'DRY RUN'})"
    )
    print(f"Scope: {scope}\n")

    summary = query(f"""
        SELECT sle.reference_id,
               gr.document_number,
               count(*)                       AS correction_rows,
               sum(sle.quantity)::float       AS correction_qty,
               min(sle.created_at)::text      AS written_at,
               array_agg(DISTINCT sle.created_by) AS actors
        FROM stock_ledger_entries sle
        LEFT JOIN goods_receipts gr ON gr.id = sle.reference_id
        WHERE {scope_sle}
        GROUP BY sle.reference_id, gr.document_number
        ORDER BY gr.document_number
    """)

    if not summary:
        print("No DATA_CORRECTION rows in scope. Nothing to revert.")
        return

    total_rows = sum(r["correction_rows"] for r in summary)
    total_qty = sum(r["correction_qty"] for r in summary)

    print(f"Corrections to revert: {total_rows} ledger row(s) across {len(summary)} receipt(s)\n")
    for r in summary:
        print(
            f"  receipt={r['document_number'] or r['reference_id']}  "
            f"rows={r['correction_rows']}  qty=+{r['correction_qty']:g}  "
            f"written_at={r['written_at']}  actor={','.join(r['actors'])}"
        )
    print(f"\nTotal quantity to subtract back out of stock_balances: {total_qty:g}")

    # Net ledger position per receipt, before and after the revert. A cancelled
    # goods receipt should net to 0; anything else is left over from the
    # original double-cancel bug and is NOT this script's job to fix.
    net = query(f"""
        SELECT gr.document_number,
               sum(e.quantity) FILTER (WHERE e.reference_type <> 'DATA_CORRECTION')::float AS net_after,
               sum(e.quantity)::float AS net_before
        FROM stock_ledger_entries e
        JOIN goods_receipts gr ON gr.id = e.reference_id
        WHERE e.reference_id IN (SELECT DISTINCT reference_id FROM stock_ledger_entries WHERE {scope})
        GROUP BY gr.document_number
        ORDER BY gr.document_number
    """)
    print("\nNet ledger per receipt (should return to the pre-fix value):")
    for r in net:
        print(
            f"  {r['document_number']}:  now={r['net_before']:+g}  "
            f"after revert={r['net_after']:+g}"
        )

    negative = query(f"""
        SELECT sb.item_id, sb.location_id,
               sb.quantity::float AS quantity_now,
               agg.q::float       AS correction,
               (sb.quantity - agg.q)::float AS quantity_after
        FROM stock_balances sb
        JOIN (
            SELECT organization_id, item_id, location_id, sum(quantity) AS q
            FROM stock_ledger_entries WHERE {scope}
            GROUP BY 1, 2, 3
        ) agg
          ON agg.organization_id = sb.organization_id
         AND agg.item_id = sb.item_id
         AND agg.location_id = sb.location_id
        WHERE sb.quantity - agg.q < 0
        ORDER BY (sb.quantity - agg.q)
    """)
    if negative:
        print(
            f"\n{len(negative)} balance(s) go negative after the revert — expected: "
            "that is the broken pre-fix state the fix was papering over."
        )
        for r in negative[:10]:
            print(
                f"  item={r['item_id']} location={r['location_id']}  "
                f"{r['quantity_now']:g} - {r['correction']:g} = {r['quantity_after']:g}"
            )
        if len(negative) > 10:
            print(f"  ... and {len(negative) - 10} more")

    if not apply_mode:
        print("\nDry run only — nothing written. Re-run with --apply to commit.")
        return

    backup_path = opts.get(
        "backup",
        f"revert-backup-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json",
    )
    rows = query(f"""
        SELECT id, organization_id, branch_id, item_id, location_id,
               movement_type, quantity::float, reference_type, reference_id,
               notes, posted_at::text, created_at::text, created_by,
               unit_cost::float, line_value::float
        FROM stock_ledger_entries WHERE {scope}
    """)
    with open(backup_path, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=2)
    print(f"\nBacked up {len(rows)} row(s) to {backup_path}")

    output = run_psql(f"""
        BEGIN;

        CREATE TEMP TABLE _revert_rows ON COMMIT DROP AS
          SELECT id, organization_id, item_id, location_id, quantity
          FROM stock_ledger_entries
          WHERE {scope};

        -- 1. take the credited quantity back out of the balances
        UPDATE stock_balances sb
        SET quantity = sb.quantity - agg.q,
            updated_at = now()
        FROM (
            SELECT organization_id, item_id, location_id, sum(quantity) AS q
            FROM _revert_rows GROUP BY 1, 2, 3
        ) agg
        WHERE sb.organization_id = agg.organization_id
          AND sb.item_id = agg.item_id
          AND sb.location_id = agg.location_id;

        -- 2. drop the correction entries themselves
        DELETE FROM stock_ledger_entries e
        USING _revert_rows r
        WHERE e.id = r.id;

        -- 3. last_movement_at was stamped now() by the fix; recompute it from
        --    whatever ledger history is left for each affected balance
        UPDATE stock_balances sb
        SET last_movement_at = sub.mx
        FROM (
            SELECT DISTINCT r.organization_id, r.item_id, r.location_id,
                   (SELECT max(e.posted_at) FROM stock_ledger_entries e
                     WHERE e.organization_id = r.organization_id
                       AND e.item_id = r.item_id
                       AND e.location_id = r.location_id) AS mx
            FROM _revert_rows r
        ) sub
        WHERE sb.organization_id = sub.organization_id
          AND sb.item_id = sub.item_id
          AND sb.location_id = sub.location_id;

        DO $$
        DECLARE leftover int;
        BEGIN
          SELECT count(*) INTO leftover
          FROM stock_ledger_entries WHERE {scope};
          IF leftover > 0 THEN
            RAISE EXCEPTION 'Aborting: % correction row(s) still in scope after delete', leftover;
          END IF;
        END $$;

        COMMIT;
    """)
    print(output)
    print(f"Reverted: {total_rows} correction row(s) deleted, {total_qty:g} qty removed from stock_balances.")


if __name__ == "__main__":
    main()
