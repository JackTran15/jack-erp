import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds INVOICE to the bank receipt reference-type enum.
 *
 * A POS sale paid by transfer/card/e-wallet moved deposit money without leaving a Phiếu thu
 * tiền gửi behind it — `PosDepositSaleConsumer` and `post-deposit.step` both wrote only a
 * `deposit_movements` row. Issuing that voucher needs a reference type pointing back at the
 * invoice; the cash side already has `cash_receipt_reference_type_enum.INVOICE`, this is its
 * missing twin.
 */
export class AddInvoiceBankReceiptReferenceType1788200000000
  implements MigrationInterface
{
  name = 'AddInvoiceBankReceiptReferenceType1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "bank_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'INVOICE'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // Rollback is intentionally a no-op.
  }
}
