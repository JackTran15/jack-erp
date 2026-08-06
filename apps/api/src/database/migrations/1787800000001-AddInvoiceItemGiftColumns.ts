import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks an invoice line as a promotion gift.
 *
 * `invoice_items` is shared with the v1 checkout flow, which this epic must not
 * change. Both columns are therefore additive and nullable-or-defaulted: v1
 * neither reads nor writes them, so its behaviour is identical before and after
 * (assumption A-12, proven by re-running the existing suite in T-04-01).
 *
 * No foreign key to `promotion_programs` on purpose: promotion programs are
 * soft-deleted, and a hard FK would block deleting a programme that historical
 * invoices still reference. The index is enough for the lookups we do.
 */
export class AddInvoiceItemGiftColumns1787800000001
  implements MigrationInterface
{
  name = 'AddInvoiceItemGiftColumns1787800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "is_gift" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "promotion_program_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_items_promotion_program" ON "invoice_items" ("promotion_program_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invoice_items_promotion_program"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "promotion_program_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "is_gift"`,
    );
  }
}
