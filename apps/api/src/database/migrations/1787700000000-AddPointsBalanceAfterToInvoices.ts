import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `points_balance_after` to invoices — the customer's loyalty point balance
 * projected right after this invoice (card balance ± this invoice's
 * redeem/earn/reverse), snapshotted inside the checkout transaction so receipts
 * can print "Số điểm hiện tại" without querying membership_cards.
 *
 * Nullable with NO default on purpose: NULL means "unknown" (walk-in customer, no
 * active card, or an invoice predating this column) and hides the receipt row,
 * while a real balance of 0 must still be shown. Existing rows stay NULL —
 * point_history carries no running balance, so history cannot be reconstructed.
 */
export class AddPointsBalanceAfterToInvoices1787700000000
  implements MigrationInterface
{
  name = 'AddPointsBalanceAfterToInvoices1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN IF NOT EXISTS "points_balance_after" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "points_balance_after"`,
    );
  }
}
