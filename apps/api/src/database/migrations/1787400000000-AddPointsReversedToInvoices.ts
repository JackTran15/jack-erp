import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `points_reversed` to invoices — loyalty points clawed back when goods are
 * returned/exchanged, computed at checkout as floor(reverseBase /
 * POINT_EARN_VND_PER_POINT). Recorded on the invoice (mirroring points_earned) so
 * return/exchange receipts can display the deducted points without querying the
 * point_history ledger. Existing invoices default to 0.
 */
export class AddPointsReversedToInvoices1787400000000
  implements MigrationInterface
{
  name = 'AddPointsReversedToInvoices1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN IF NOT EXISTS "points_reversed" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "points_reversed"`,
    );
  }
}
