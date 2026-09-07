import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the document-pairing predicate that Báo cáo 6 / 7 and the
 * transfer drill-downs run (`PAIRED_RECEIPT_EXISTS` in
 * `transfer-report.service.ts`).
 *
 * Both legs of a two-phase transfer carry the owning `transfer_orders.id` in
 * their own `reference_id`, and the report pairs them on it. `reference_id` was
 * added bare in `1782800000000-StockTakeAdjustmentDocs.ts` — no index has ever
 * covered it, so the `EXISTS` fell back to a sequential scan of
 * `goods_receipts` once per issue line.
 *
 * Partial and organization-scoped because every caller pins the same three
 * constants: the predicate never looks at a receipt that is not a POSTED
 * TRANSFER_IN carrying a transfer-order reference. Keeping those out of the
 * index keeps it small on organizations whose receipts are mostly purchases.
 *
 * Plain CREATE INDEX, not CONCURRENTLY: TypeORM runs each migration inside a
 * transaction, and CONCURRENTLY cannot run in one. These tables are small
 * enough that the write lock is momentary; revisit if that stops being true.
 */
export class AddTransferReferenceIndexes1789500000000
  implements MigrationInterface
{
  name = 'AddTransferReferenceIndexes1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_goods_issues_transfer_reference"
        ON "goods_issues" ("organization_id", "reference_id")
        WHERE "reference_type" = 'TRANSFER_ORDER' AND "reference_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_goods_receipts_transfer_reference"
        ON "goods_receipts" ("organization_id", "reference_id")
        WHERE "reference_type" = 'STOCK_TRANSFER'
          AND "reference_id" IS NOT NULL
          AND "status" = 'POSTED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_goods_receipts_transfer_reference"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_goods_issues_transfer_reference"`,
    );
  }
}
