import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-line manual discount breakdown to `invoice_items`:
 * `line_discount_type` (percent|amount), `line_discount_value` (raw user value),
 * and `line_discount_reason` (free-text label). The existing `line_discount`
 * (computed amount) and `note` columns are unchanged — the new columns capture
 * how that amount was derived so reads can re-render "10% (59,000) - cc".
 * All nullable; existing rows keep NULL (legacy raw-amount discounts).
 */
export class AddInvoiceItemLineDiscountBreakdown1782600000000
  implements MigrationInterface
{
  name = 'AddInvoiceItemLineDiscountBreakdown1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "invoice_items_line_discount_type_enum" AS ENUM ('percent', 'amount');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "line_discount_type" "invoice_items_line_discount_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "line_discount_value" numeric(18,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "line_discount_reason" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "line_discount_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "line_discount_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "line_discount_type"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "invoice_items_line_discount_type_enum"`,
    );
  }
}
