import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Khách không lấy tiền thừa" — the cash a customer leaves behind at checkout.
 *
 * It is deliberately NOT folded into `total_paid`: the invoice is settled at
 * `amount_due` (payments may never exceed it — see CheckoutInvoiceService), and
 * the surplus is other income booked by its own Phiếu thu. The column keeps the
 * sale document self-describing so a reprint can still show what was tendered,
 * and the new reference type lets that receipt key on the invoice without
 * colliding with the POS_SALE receipt.
 */
export class AddKeptChangeToInvoices1788100000000 implements MigrationInterface {
  name = 'AddKeptChangeToInvoices1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN IF NOT EXISTS "kept_change_amount" NUMERIC(18,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TYPE "cash_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'INVOICE_KEPT_CHANGE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "kept_change_amount"`,
    );
    // PostgreSQL does not support removing enum values without recreating the type.
    // Rolling the enum back is intentionally a no-op.
  }
}
