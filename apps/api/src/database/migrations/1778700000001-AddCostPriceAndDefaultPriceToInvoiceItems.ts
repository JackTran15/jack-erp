import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostPriceAndDefaultPriceToInvoiceItems1778700000001 implements MigrationInterface {
  name = 'AddCostPriceAndDefaultPriceToInvoiceItems1778700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
        ADD COLUMN "unit_price_default" NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN "cost_price"         NUMERIC(18,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
        DROP COLUMN "unit_price_default",
        DROP COLUMN "cost_price"
    `);
  }
}
