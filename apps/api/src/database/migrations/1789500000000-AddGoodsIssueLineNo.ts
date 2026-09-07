import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `goods_issue_lines` an explicit ordinal (ADR-01).
 *
 * Until now the table carried no way to express line order: no `created_at`, no
 * sequence column. `GoodsIssueService.getLines` therefore ordered by `id`, which
 * is a random uuid v4 — a stable but arbitrary permutation of the voucher's
 * lines. That is easy to miss while the whole voucher renders as one scrolling
 * list, and impossible to miss once the list is paginated: the last line typed
 * shows up on page 1.
 *
 * The receipt side needs none of this — `goods_receipt_lines` has a
 * `@CreateDateColumn` and already orders by it.
 *
 * Backfill orders by `ctid` — the physical position of the row (ADR-09).
 *
 * The first version of this migration ordered by `id`, on the reasoning that the
 * original typing order was gone: no timestamp on the row, and
 * `stock_ledger_entries` writes a whole voucher through one
 * `recordBatchMovements` call, so `posted_at` is identical across it. That
 * reasoning was never measured, and it is wrong. The order survives in the
 * physical layout, because every write path inserts a voucher's lines as one
 * batch in array order and no path ever updates a line in place (editing a
 * voucher deletes every line and re-inserts the set).
 *
 * Measured on a production snapshot, over 6,452 adjacent line pairs, counting how
 * often the next line's item code sorts after the previous one — import sheets
 * are typically ordered by code, so this is a proxy for "is this order
 * meaningful": `ctid` 82.6%, `id` 50.7%. Fifty percent is a coin toss. Ordering
 * by `id` did not freeze the order the app was displaying; it froze noise.
 *
 *
 * RUN THIS ONCE. The backfill's own UPDATE touches every row, and an UPDATE in
 * Postgres writes a new tuple version at a new physical location — so the moment
 * this migration finishes, `ctid` no longer reflects insert order, it reflects
 * the order this UPDATE happened to rewrite in. `down()` followed by a re-run
 * therefore reads an order this migration itself degraded. Measured on a
 * production snapshot: 94.5% on the first run, 92.5% on a second run after a
 * revert, with 161,731 of 162,776 rows renumbered. Still far better than the
 * 49.8% of `ORDER BY id`, but it is a one-way door and each cycle loses a
 * little more.
 *
 * `down()` exists for development. On any database whose line order matters,
 * recover by restoring the pre-migration snapshot, not by reverting and
 * re-running.
 * `ctid` is a physical address, not a logical guarantee — VACUUM FULL, pg_repack
 * or a dump/restore cycle can rewrite the table and scramble it. Hence the strict
 * limit: it is read HERE, ONCE, during backfill, and nowhere else. After this
 * runs, `line_no` is the only ordering source; no application code may read
 * `ctid`. If the table has been rewritten before this migration runs on a given
 * database, the recovered order degrades — but never below `ORDER BY id`, which
 * is guaranteed noise. (The snapshot the numbers above come from is itself a
 * restore, and the signal survived it.)
 *
 * Column is added nullable, backfilled, then tightened to NOT NULL, so the table
 * is never rewritten with a lock held over a default expression. The backfill's
 * `WHERE line_no IS NULL` makes a re-run a no-op instead of renumbering rows
 * that already hold good values.
 *
 * No DB-level default on purpose. Every write path that inserts a line must set
 * `line_no` itself (T-01-02); a default would let a missed path insert silently
 * and only surface later as a unique-index collision on the second such line.
 * Failing loudly at the insert is the better error.
 */
export class AddGoodsIssueLineNo1789500000000 implements MigrationInterface {
  name = 'AddGoodsIssueLineNo1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ADD COLUMN IF NOT EXISTS "line_no" integer`,
    );

    await queryRunner.query(`
      UPDATE "goods_issue_lines" l
      SET "line_no" = r.rn
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (PARTITION BY "goods_issue_id" ORDER BY "ctid") AS rn
        FROM "goods_issue_lines"
      ) r
      WHERE l."id" = r."id"
        AND l."line_no" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ALTER COLUMN "line_no" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_goods_issue_lines_doc_line_no" ON "goods_issue_lines" ("goods_issue_id", "line_no")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_goods_issue_lines_doc_line_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" DROP COLUMN IF EXISTS "line_no"`,
    );
  }
}
