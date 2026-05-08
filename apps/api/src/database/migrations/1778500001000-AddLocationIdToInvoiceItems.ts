import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationIdToInvoiceItems1778500001000 implements MigrationInterface {
  name = 'AddLocationIdToInvoiceItems1778500001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
      ADD COLUMN IF NOT EXISTS "location_id" uuid NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "invoice_items"."location_id" IS 'Inventory location the stock was drawn from at sale time'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "location_id"
    `);
  }
}
