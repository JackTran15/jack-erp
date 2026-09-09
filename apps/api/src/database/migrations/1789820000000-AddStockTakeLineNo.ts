import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `stock_take_lines` an explicit ordinal (ADR-03), same shape as
 * `1789600000000-AddGoodsReceiptLineNo` and
 * `1789800000000-AddTransferOrderLineNo`: add nullable, backfill, tighten to
 * NOT NULL, then add the unique index — the table is never rewritten with a
 * lock held over a default expression.
 *
 * What is different here: `stock_take_lines` is EMPTY on `erp_dev_3008` (a
 * restored production snapshot) — `SELECT count(*)` = 0. Every measurement the
 * sibling migrations made (tie rate of `created_at`, `ctid` vs `id` ordering
 * signal) is therefore impossible to make on this table today. That is a gap
 * in the evidence, not a reason to believe the risk is lower: `stock_take_lines`
 * has the same `@CreateDateColumn` shape as `goods_receipt_lines`, where 463 of
 * 627 vouchers turned out to share one `created_at` across the whole voucher
 * (up to 5,000 rows on one timestamp). If a future environment has real data
 * with heavy ties, `created_at` will NOT discriminate rows inserted by the same
 * `create()` call, and `ctid` (the tie-break here, not the leading key) is what
 * actually decides — read `ctid`, per row, ONCE, during this backfill's own
 * snapshot read, exactly as the sibling migrations do.
 *
 * `ORDER BY created_at, ctid` (not `ORDER BY ctid` alone) is kept as the
 * leading sort key because, unlike `stock_transfer_lines`, this table's
 * `getById`/`exportExcelBuffer` read path already treats `created_at` as
 * meaningful metadata for the voucher (see `stock-take.service.ts`) — same
 * reasoning `AddGoodsReceiptLineNo` used before its own measurement showed
 * `created_at` was actually broken on that table. There, on 0 rows to measure,
 * we cannot make the equivalent correctness claim either way; this backfill
 * uses the same formula as `transfer_order_lines` (`created_at`, `ctid`) as the
 * safer default given ties are unproven rather than disproven.
 *
 * RUN THIS ONCE. The backfill's own UPDATE rewrites every row's `ctid`; a
 * `down()` + re-run would freeze an order this migration itself already
 * degraded once. `down()` exists for development only — on any database whose
 * displayed order matters, recover by restoring the pre-migration snapshot, not
 * by reverting and re-running.
 *
 * No DB-level default on purpose. Every write path that inserts a
 * `StockTakeLineEntity` (`StockTakeService.create()`, batched by array index,
 * and `StockTakeService.addLine()`, incremental, next = current max + 1) must
 * set `lineNo` itself; a default would let a missed path insert silently and
 * only surface later as a unique-index collision on the second such line.
 */
export class AddStockTakeLineNo1789820000000 implements MigrationInterface {
  name = 'AddStockTakeLineNo1789820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_take_lines" ADD COLUMN IF NOT EXISTS "line_no" integer`,
    );

    // The ROW_NUMBER() SELECT runs as one snapshot before any row is
    // rewritten, so it reads the ctid ordering that existed before this very
    // UPDATE started invalidating it row by row.
    await queryRunner.query(`
      UPDATE "stock_take_lines" l
      SET "line_no" = r.rn
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "stock_take_id"
                 ORDER BY "created_at", "ctid"
               ) AS rn
        FROM "stock_take_lines"
      ) r
      WHERE l."id" = r."id"
        AND l."line_no" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "stock_take_lines" ALTER COLUMN "line_no" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_take_lines_doc_line_no" ON "stock_take_lines" ("stock_take_id", "line_no")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_stock_take_lines_doc_line_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_take_lines" DROP COLUMN IF EXISTS "line_no"`,
    );
  }
}
