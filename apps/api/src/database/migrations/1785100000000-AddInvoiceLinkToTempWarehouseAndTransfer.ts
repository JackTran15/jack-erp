import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Link temp-warehouse lines and stock transfers back to the POS invoice that
 * consumed them. When a checkout sells an item that is staged in the temp
 * warehouse, the fulfillment consumer marks the consumed line TRANSFERRED and
 * posts a warehouse -> showroom transfer; both now carry invoice_id /
 * invoice_number so the temp-warehouse report can fill saleQty/invoice and the
 * Chuyển kho tạm screen can surface sale-consumed rows.
 *
 * Columns are nullable; existing rows backfill to NULL (no data break). The
 * partial index supports invoice lookups on lines actually tied to a sale.
 */
export class AddInvoiceLinkToTempWarehouseAndTransfer1785100000000
  implements MigrationInterface
{
  name = 'AddInvoiceLinkToTempWarehouseAndTransfer1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "temp_warehouse_lines"
        ADD COLUMN IF NOT EXISTS "invoice_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "invoice_number" varchar(50) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
        ADD COLUMN IF NOT EXISTS "invoice_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "invoice_number" varchar(50) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_temp_warehouse_lines_invoice"
        ON "temp_warehouse_lines" ("invoice_id")
        WHERE "invoice_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_temp_warehouse_lines_invoice"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
        DROP COLUMN IF EXISTS "invoice_number",
        DROP COLUMN IF EXISTS "invoice_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "temp_warehouse_lines"
        DROP COLUMN IF EXISTS "invoice_number",
        DROP COLUMN IF EXISTS "invoice_id"
    `);
  }
}
