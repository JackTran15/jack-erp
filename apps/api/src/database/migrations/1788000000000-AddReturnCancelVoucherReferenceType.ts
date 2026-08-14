import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds RETURN_CANCEL to the cash/bank receipt reference-type enums.
 *
 * Cancelling a posted return/exchange collects the refunded money back, which
 * needs its own reference so the receipt keys on the voided return invoice
 * without colliding with the POS_SALE receipt that already owns
 * (INVOICE, invoice_id) — those two share an id space but not a meaning.
 */
export class AddReturnCancelVoucherReferenceType1788000000000
  implements MigrationInterface
{
  name = 'AddReturnCancelVoucherReferenceType1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "cash_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'RETURN_CANCEL'
    `);
    await queryRunner.query(`
      ALTER TYPE "bank_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'RETURN_CANCEL'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // Rollback is intentionally a no-op.
  }
}
