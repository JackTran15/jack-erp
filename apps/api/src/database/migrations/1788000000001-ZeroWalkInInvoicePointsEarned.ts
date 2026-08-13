import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clears the loyalty figures recorded on invoices that have no customer.
 *
 * These numbers were never real. `LoyaltyPointsPublisher` refuses to emit
 * without a `customerId`, so no card was ever credited and no `point_history`
 * row exists for them — yet the column was written anyway and the receipt
 * printed "Điểm được tích +122" to a walk-in customer who had no points.
 *
 * This is removing data that never corresponded to anything, not correcting a
 * posted transaction: there is no ledger entry, no card movement and no voucher
 * referencing these values. Invoices that DO have a customer are left strictly
 * alone — those have real `point_history` rows behind them, and rewriting them
 * would put the loyalty ledger out of step with the cards.
 */
export class ZeroWalkInInvoicePointsEarned1788000000001
  implements MigrationInterface
{
  name = 'ZeroWalkInInvoicePointsEarned1788000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "invoices"
      SET "points_earned" = 0
      WHERE "customer_id" IS NULL AND "points_earned" <> 0
    `);
    // Same reasoning: a walk-in invoice cannot have reversed points either.
    await queryRunner.query(`
      UPDATE "invoices"
      SET "points_reversed" = 0
      WHERE "customer_id" IS NULL AND "points_reversed" <> 0
    `);
  }

  public async down(): Promise<void> {
    // Intentionally a no-op. The previous values were meaningless — restoring
    // them would only put the phantom figures back.
  }
}
