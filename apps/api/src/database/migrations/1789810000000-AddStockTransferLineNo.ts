import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `stock_transfer_lines` an explicit ordinal (ADR-03).
 *
 * The table carries no ordering key at all: no `created_at`, no sequence
 * column, only a `@PrimaryGeneratedColumn('uuid')` random id. Unlike
 * `goods_issue_lines` (see `1789500000000-AddGoodsIssueLineNo.ts`), the
 * physical layout here is NOT a good proxy for the original typing order
 * either.
 *
 * Measured on `erp_dev_3008` (a restored production snapshot), over transfers
 * with 5+ lines, counting how often the next line's item code sorts after the
 * previous one (a proxy for "is this order meaningful"): `ctid` 53.7%,
 * `id` 49.3%. Both are essentially a coin flip — the original entry order is
 * genuinely lost, and this backfill does NOT restore it.
 *
 * The backfill still orders by `ctid`, but for a different reason: the FE
 * reads `row.lines` from a `leftJoinAndSelect` with no `ORDER BY`
 * (`search-stock-transfers-v2.handler.ts:67`), i.e. users are already looking
 * at physical row order today. Backfilling `line_no` from `ctid` FREEZES the
 * order currently on screen — it does not recover anything, it just stops the
 * next reshuffle (e.g. from pagination or a future `ORDER BY id`) from moving
 * lines the user has already seen in a given position.
 *
 * RUN THIS ONCE. Like the goods-issue-lines migration, the backfill's own
 * UPDATE rewrites every row's `ctid`; a `down()` + re-run would freeze an
 * order this migration itself already degraded once. `down()` exists for
 * development only — on any database whose displayed order matters, recover
 * by restoring the pre-migration snapshot, not by reverting and re-running.
 *
 * Column is added nullable, backfilled, then tightened to NOT NULL, so the
 * table is never rewritten with a lock held over a default expression. The
 * backfill's `WHERE line_no IS NULL` makes a re-run a no-op instead of
 * renumbering rows that already hold good values.
 *
 * No DB-level default on purpose. Every write path that inserts a line
 * (`StockTransferService.create/update/postIntraWarehouseMoves`) must set
 * `lineNo` itself; a default would let a missed path insert silently and
 * only surface later as a unique-index collision on the second such line.
 */
export class AddStockTransferLineNo1789810000000 implements MigrationInterface {
  name = 'AddStockTransferLineNo1789810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "line_no" integer`,
    );

    // The ROW_NUMBER() SELECT runs as one snapshot before any row is
    // rewritten, so it reads the ctid ordering that existed before this very
    // UPDATE started invalidating it row by row.
    await queryRunner.query(`
      UPDATE "stock_transfer_lines" l
      SET "line_no" = r.rn
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (PARTITION BY "transfer_id" ORDER BY "ctid") AS rn
        FROM "stock_transfer_lines"
      ) r
      WHERE l."id" = r."id"
        AND l."line_no" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" ALTER COLUMN "line_no" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_transfer_lines_doc_line_no" ON "stock_transfer_lines" ("transfer_id", "line_no")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_stock_transfer_lines_doc_line_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP COLUMN IF EXISTS "line_no"`,
    );
  }
}
