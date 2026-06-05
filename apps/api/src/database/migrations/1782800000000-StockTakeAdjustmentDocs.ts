import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock-take "Xử lý" generates adjustment documents that mirror MISA:
 *  - a distinct purpose value (STOCK_TAKE) so the lists label them
 *    "Phiếu nhập/xuất kho kiểm kê",
 *  - a reference back to the originating stock-take (Tham chiếu → KK…).
 *
 * goods_receipts already has reference_id/reference_type; goods_issues does not,
 * so we add the two columns there. The new enum values are added with
 * ADD VALUE IF NOT EXISTS (Postgres 12+ allows this inside a transaction as long
 * as the value is not used in the same transaction — it isn't here).
 */
export class StockTakeAdjustmentDocs1782800000000
  implements MigrationInterface
{
  name = 'StockTakeAdjustmentDocs1782800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "goods_receipt_purpose_enum" ADD VALUE IF NOT EXISTS 'STOCK_TAKE'`,
    );
    await q.query(
      `ALTER TYPE "goods_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'STOCK_TAKE'`,
    );
    await q.query(
      `ALTER TYPE "goods_issue_purpose_enum" ADD VALUE IF NOT EXISTS 'STOCK_TAKE'`,
    );
    await q.query(
      `ALTER TABLE "goods_issues" ADD COLUMN IF NOT EXISTS "reference_id" uuid`,
    );
    await q.query(
      `ALTER TABLE "goods_issues" ADD COLUMN IF NOT EXISTS "reference_type" character varying`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "reference_type"`,
    );
    await q.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "reference_id"`,
    );
    // NOTE: Postgres cannot DROP an enum value, so the 'STOCK_TAKE' values added
    // to the three *_enum types remain after a revert. They are unused once the
    // adjustment-doc code is rolled back, so this is harmless.
  }
}
