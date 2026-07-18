import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `points_earned` to invoices — loyalty points earned from the invoice,
 * computed at checkout as floor(amountDue / POINT_EARN_VND_PER_POINT). Recorded
 * on the invoice (mirroring points_redeemed) so receipts can display it without
 * querying the point_history ledger. Existing invoices default to 0.
 */
export class AddPointsEarnedToInvoices1786400000002
  implements MigrationInterface
{
  name = 'AddPointsEarnedToInvoices1786400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN IF NOT EXISTS "points_earned" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "points_earned"`,
    );
  }
}
