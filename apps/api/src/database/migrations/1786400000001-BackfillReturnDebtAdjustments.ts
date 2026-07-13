import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill debt-ledger rows for historical return/exchange invoices that were
 * offset into a customer's debt ("Tính vào công nợ").
 *
 * At runtime a return with refundMethod=OFFSET only REDUCES the original sale's
 * debt row; it never created its own `invoice_debts` row, so the return invoice
 * was not visible/clickable in the customer's Công nợ tab. New returns now emit
 * an `adjustment` row (see CheckoutReturnService.createReturnDebtAdjustment);
 * this migration backfills the same row for returns posted before that change.
 *
 * The exact amount applied at offset time (min(refunded, remaining-then)) is not
 * reconstructable from current data, so we use the full `refunded_amount` as a
 * documented approximation — the row's purpose is viewability + a reduction
 * marker, not live debt math (remaining_amount = 0, status = paid).
 */
export class BackfillReturnDebtAdjustments1786400000001
  implements MigrationInterface
{
  name = 'BackfillReturnDebtAdjustments1786400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "invoice_debts"
        ("id", "organization_id", "branch_id", "created_by", "created_at",
         "updated_at", "reference_code", "invoice_id", "customer_id",
         "document_type", "original_amount", "paid_amount", "remaining_amount",
         "issued_at", "status", "settled_at")
      SELECT
        uuid_generate_v4(), ri."organization_id", ri."branch_id", ri."created_by",
        now(), now(), ri."code", ri."id", oi."customer_id",
        'adjustment', -ri."refunded_amount", 0, 0,
        ri."issued_at"::date, 'paid', ri."issued_at"
      FROM "invoices" ri
      JOIN "invoices" oi ON oi."id" = ri."original_invoice_id"
      WHERE ri."type" IN ('RETURN', 'EXCHANGE')
        AND ri."refund_method" = 'OFFSET'
        AND ri."refunded_amount" > 0
        AND ri."status" = 'paid'
        AND ri."original_invoice_id" IS NOT NULL
        AND oi."customer_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "invoice_debts" d WHERE d."invoice_id" = ri."id"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Destructive on revert: also removes adjustment rows created at runtime by
    // CheckoutReturnService after this migration ran.
    await queryRunner.query(`
      DELETE FROM "invoice_debts" d
      USING "invoices" ri
      WHERE d."invoice_id" = ri."id"
        AND d."document_type" = 'adjustment'
        AND ri."type" IN ('RETURN', 'EXCHANGE')
    `);
  }
}
