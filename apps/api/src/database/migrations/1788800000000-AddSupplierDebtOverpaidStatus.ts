import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `overpaid` to `supplier_debt_status_enum`.
 *
 * Editing a credit goods receipt down below what has already been paid to the
 * supplier leaves `remainingAmount` negative — the supplier owes the branch, not
 * the other way round. `open | paid | overdue` cannot express that, so a fourth
 * status is added. No feature is sending a refund voucher for it (see A-03); the
 * negative balance is simply surfaced on the supplier-debt report.
 */
export class AddSupplierDebtOverpaidStatus1788800000000
  implements MigrationInterface
{
  name = 'AddSupplierDebtOverpaidStatus1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "supplier_debt_status_enum" ADD VALUE IF NOT EXISTS 'overpaid'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a single enum value; reverting would require rebuilding
    // the type and every column/index that uses it. Left as a no-op, matching the
    // repo's existing enum-add migrations (e.g. AddSupplierDebts's siblings).
  }
}
