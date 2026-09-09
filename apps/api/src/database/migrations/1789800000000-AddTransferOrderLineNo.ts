import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `transfer_order_lines` an explicit ordinal (ADR-03).
 *
 * Unlike `stock_transfer_lines` (see `1789810000000-AddStockTransferLineNo.ts`),
 * this table DOES carry `created_at`, but it is not usable alone: 248 of 392
 * transfer orders have ties on it, covering 5,681 of 5,840 lines (multiple
 * lines inserted in the same transaction/millisecond).
 *
 * Measured on `erp_dev_3008` (a restored production snapshot), counting how
 * often the next line's item code sorts after the previous one within the
 * same order (a proxy for "is this order meaningful"): `ctid` 84.1%,
 * `(created_at, ctid)` 84.1%, `id` 49.3%. Unlike the stock-transfer table,
 * the original typing order IS still recoverable here — `created_at` picks
 * out same-order groups, `ctid` breaks the tie inside a group, and both land
 * on the same 84.1% figure because within a tied `created_at` group physical
 * insertion order is exactly typing order. This backfill RECOVERS the order
 * the lines were entered in; it does not merely freeze an arbitrary one.
 *
 * RUN THIS ONCE. Like the goods-issue-lines / stock-transfer-lines
 * migrations, the backfill's own UPDATE rewrites every row's `ctid`; a
 * `down()` + re-run would not reproduce the same result because `ctid` is no
 * longer the original physical layout. `down()` exists for development only.
 *
 * Column is added nullable, backfilled, then tightened to NOT NULL, so the
 * table is never rewritten with a lock held over a default expression. The
 * backfill's `WHERE line_no IS NULL` makes a re-run a no-op instead of
 * renumbering rows that already hold good values.
 *
 * No DB-level default on purpose. Every write path that inserts a line
 * (`TransferOrderService.create/update/adjustRequestedQty`) must set
 * `lineNo` itself; a default would let a missed path insert silently and
 * only surface later as a unique-index collision on the second such line.
 */
export class AddTransferOrderLineNo1789800000000 implements MigrationInterface {
  name = 'AddTransferOrderLineNo1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" ADD COLUMN IF NOT EXISTS "line_no" integer`,
    );

    // The ROW_NUMBER() SELECT runs as one snapshot before any row is
    // rewritten, so it reads the created_at/ctid ordering that existed
    // before this very UPDATE started invalidating ctid row by row.
    await queryRunner.query(`
      UPDATE "transfer_order_lines" l
      SET "line_no" = r.rn
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "transfer_order_id" ORDER BY "created_at", "ctid"
               ) AS rn
        FROM "transfer_order_lines"
      ) r
      WHERE l."id" = r."id"
        AND l."line_no" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" ALTER COLUMN "line_no" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_transfer_order_lines_order_line_no" ON "transfer_order_lines" ("transfer_order_id", "line_no")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_transfer_order_lines_order_line_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" DROP COLUMN IF EXISTS "line_no"`,
    );
  }
}
