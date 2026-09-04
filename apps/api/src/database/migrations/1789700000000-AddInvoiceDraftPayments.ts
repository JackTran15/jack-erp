import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshot of the payment lines a cashier had typed when they parked a cart with
 * the hold-cart action. Reopening a held cart used to hand back an empty cash
 * line, so the cashier retyped the tendered amount for every parked invoice.
 *
 * It is a jsonb column on `invoices` rather than rows in `invoice_payments`
 * because that table requires `account_id` and feeds journal entries: a draft has
 * no resolved COA yet, and money that was never taken has no business reaching
 * accounting. Nothing joins on this column, so it carries no index.
 *
 * NULL is meaningful and needs no backfill — it is exactly "a draft saved before
 * this column existed", which the POS restores with a single cash line equal to
 * the amount due, the behaviour it had before.
 */
export class AddInvoiceDraftPayments1789700000000 implements MigrationInterface {
  name = 'AddInvoiceDraftPayments1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN IF NOT EXISTS "draft_payments" jsonb
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "invoices"."draft_payments" IS
        'Payment lines tendered on the POS at save-draft time: [{ method, amount, paymentAccountId }]. Only meaningful while is_draft is true; never read by checkout or accounting'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices" DROP COLUMN IF EXISTS "draft_payments"
    `);
  }
}
