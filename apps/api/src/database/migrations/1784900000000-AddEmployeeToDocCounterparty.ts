import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow goods documents (receipt / issue) to reference an employee as their
 * "Đối tượng" counterparty, in addition to supplier and customer. Adds the
 * 'employee' value to doc_counterparty_kind_enum.
 *
 * migrationsTransactionMode is 'each', so this commits before any later
 * migration could use the new value.
 */
export class AddEmployeeToDocCounterparty1784900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "doc_counterparty_kind_enum" ADD VALUE IF NOT EXISTS 'employee'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value; leaving 'employee' in place is
    // harmless and avoids an enum recreate. No-op.
  }
}
