import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `goods_receipt_lines` an explicit ordinal, mirroring what
 * `1789500000000-AddGoodsIssueLineNo` did for the issue side (ADR-05).
 *
 * Both migrations order by `ctid`, the physical position of the row (ADR-09).
 * `created_at` is kept as the leading sort key here only because this table has
 * one and it costs nothing when it does carry information.
 *
 * On this table it carries none. An earlier version of this migration ordered by
 * `created_at, id` in the belief that `created_at` held the real line order —
 * `getLines` had been ordering by it all along, and on a freshly seeded
 * development database, where rows are inserted one at a time, it does
 * distinguish every line. On production data it distinguishes nothing: 463 of
 * 627 vouchers have duplicate `created_at` among their lines, covering 162,612
 * of 162,776 rows, and the largest voucher is 5,000 lines sharing a SINGLE
 * timestamp. The 164 vouchers where it looked clean turned out to be
 * single-line vouchers. So `ORDER BY created_at, id` degraded to `ORDER BY id`
 * for essentially the whole table — and `id` is a random uuid.
 *
 * That also means `ORDER BY created_at ASC` never promised a stable read for
 * those vouchers in the first place: 5,000 equal keys leave the order
 * unspecified, so the same voucher could come back differently between calls.
 * Giving it `line_no` makes it deterministic for the first time.
 *
 * Measured over 162,149 adjacent line pairs, counting how often the next line's
 * item code sorts after the previous one (import sheets are ordered by code, so
 * this is a proxy for "is this order meaningful"): `ctid` 94.5%, `id` 49.8%.
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
 * or a dump/restore can rewrite the table and scramble it. It is therefore read
 * HERE, ONCE, during backfill, and nowhere else: after this runs `line_no` is the
 * only ordering source, and no application code may read `ctid`.
 *
 * Why add the column at all: the original argument was symmetry — after the
 * issue side moved to `line_no`, two twin document types were expressing one
 * concept two different ways, and the shared line-search handler has to return
 * both "in line order". The numbers above turned that from a tidiness argument
 * into a correctness one: `created_at` was not merely a second mechanism, it was
 * a broken one. It stays on the table as metadata; it is no longer the source of
 * order, and ordering by it again would reintroduce the non-determinism.
 *
 * Mechanics are the same as the issue side, for the same reasons: add nullable,
 * backfill, tighten to NOT NULL, then add the unique index — so the table is
 * never rewritten with a lock held over a default expression. `WHERE line_no IS
 * NULL` makes a re-run a no-op instead of renumbering rows that already hold
 * good values.
 *
 * No DB-level default on purpose. Every write path that inserts a line must set
 * `line_no` itself; a default would let a missed path insert silently and only
 * surface later as a unique-index collision on the second such line. Failing
 * loudly at the insert is the better error.
 */
export class AddGoodsReceiptLineNo1789600000000 implements MigrationInterface {
  name = 'AddGoodsReceiptLineNo1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "line_no" integer`,
    );

    await queryRunner.query(`
      UPDATE "goods_receipt_lines" l
      SET "line_no" = r.rn
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "goods_receipt_id"
                 ORDER BY "created_at", "ctid"
               ) AS rn
        FROM "goods_receipt_lines"
      ) r
      WHERE l."id" = r."id"
        AND l."line_no" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" ALTER COLUMN "line_no" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_goods_receipt_lines_doc_line_no" ON "goods_receipt_lines" ("goods_receipt_id", "line_no")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_goods_receipt_lines_doc_line_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" DROP COLUMN IF EXISTS "line_no"`,
    );
  }
}
