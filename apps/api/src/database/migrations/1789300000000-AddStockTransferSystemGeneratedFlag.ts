import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `is_system_generated` to `stock_transfers` — the flag that tells a phiếu
 * chuyển kho typed into the "Thêm mới" form from one materialized by another
 * flow (temp warehouse session, POS checkout fulfillment, shelf arrangement).
 *
 * Only user-created transfers may be edited: a system-generated document mirrors
 * stock already moved by its owning flow, so reversing and re-posting it from the
 * Chuyển kho screen would desynchronize that flow's own records.
 *
 * Backfill marks the documents that carry a machine-written provenance: the POS
 * fulfillment link (`invoice_id`) and the notes stamped by the temp-warehouse
 * materializer. Everything else stays editable, exactly as it is today.
 */
export class AddStockTransferSystemGeneratedFlag1789300000000
  implements MigrationInterface
{
  name = 'AddStockTransferSystemGeneratedFlag1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD COLUMN IF NOT EXISTS "is_system_generated" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_transfers"."is_system_generated" IS
        'True when the document was materialized by a system flow (temp warehouse session, POS checkout fulfillment, shelf arrangement) instead of the "Thêm mới" form. System-generated transfers cannot be edited.'
    `);
    await queryRunner.query(`
      UPDATE "stock_transfers"
      SET "is_system_generated" = true
      WHERE "invoice_id" IS NOT NULL
         OR "notes" LIKE 'From temp warehouse session %'
         OR "notes" LIKE 'Partial from temp warehouse session %'
         OR "notes" LIKE 'Chuyển kho bán hàng hóa từ phiếu xuất đi tại kho tạm theo hóa đơn số %'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "is_system_generated"
    `);
  }
}
