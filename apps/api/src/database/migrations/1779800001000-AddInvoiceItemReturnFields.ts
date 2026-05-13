import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceItemReturnFields1779800001000 implements MigrationInterface {
  name = 'AddInvoiceItemReturnFields1779800001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "item_direction_enum" AS ENUM ('OUT', 'IN')`,
    );

    await queryRunner.query(`
      ALTER TABLE "invoice_items"
        ADD COLUMN "original_invoice_item_id" uuid NULL,
        ADD COLUMN "returned_quantity" numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN "direction" "item_direction_enum" NOT NULL DEFAULT 'OUT'
    `);

    await queryRunner.query(`
      ALTER TABLE "invoice_items"
        ADD CONSTRAINT "FK_invoice_items_original_item"
        FOREIGN KEY ("original_invoice_item_id") REFERENCES "invoice_items"("id")
        ON DELETE RESTRICT
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_items_original_item" ON "invoice_items" ("original_invoice_item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoice_items_original_item"`);
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "FK_invoice_items_original_item"`,
    );
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
        DROP COLUMN IF EXISTS "direction",
        DROP COLUMN IF EXISTS "returned_quantity",
        DROP COLUMN IF EXISTS "original_invoice_item_id"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "item_direction_enum"`);
  }
}
