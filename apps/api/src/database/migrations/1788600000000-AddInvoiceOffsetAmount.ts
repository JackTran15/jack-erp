import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `invoices.offset_amount` — the part of a return's refund that settled the
 * original sale's outstanding debt instead of leaving the till.
 *
 * `refunded_amount` keeps its meaning (the whole value handed back), so the money
 * that actually moved is `refunded_amount - offset_amount`. Historical rows
 * default to 0, which is exactly what they did: the whole refund was paid out.
 */
export class AddInvoiceOffsetAmount1788600000000 implements MigrationInterface {
  name = 'AddInvoiceOffsetAmount1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN IF NOT EXISTS "offset_amount" numeric(18,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "invoices"."offset_amount" IS
        'Part of refunded_amount applied against the original invoice debt; cash paid out = refunded_amount - offset_amount'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices" DROP COLUMN IF EXISTS "offset_amount"
    `);
  }
}
