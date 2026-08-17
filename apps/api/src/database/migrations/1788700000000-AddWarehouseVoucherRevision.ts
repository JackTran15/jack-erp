import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `revision` to both warehouse voucher tables — the counter that tells one
 * edit of a posted voucher from the next.
 *
 * Editing a posted goods receipt or goods issue writes adjustment rows to the stock
 * ledger and, for cash receipts, an adjusting cash voucher. Both the cash voucher
 * services and the outbox event id dedupe on the source reference, so a second edit
 * of the same voucher would be swallowed as a replay unless the reference carries
 * the revision. Existing rows start at 0, meaning "never edited".
 */
export class AddWarehouseVoucherRevision1788700000000
  implements MigrationInterface
{
  name = 'AddWarehouseVoucherRevision1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "goods_receipts"
      ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "goods_receipts"."revision" IS
        'Number of times this posted voucher has been edited; 0 = never edited'
    `);
    await queryRunner.query(`
      ALTER TABLE "goods_issues"
      ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "goods_issues"."revision" IS
        'Number of times this posted voucher has been edited; 0 = never edited'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "revision"
    `);
    await queryRunner.query(`
      ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "revision"
    `);
  }
}
