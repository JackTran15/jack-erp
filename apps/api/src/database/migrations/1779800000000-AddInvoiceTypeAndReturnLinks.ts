import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceTypeAndReturnLinks1779800000000 implements MigrationInterface {
  name = 'AddInvoiceTypeAndReturnLinks1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "invoice_type_enum" AS ENUM ('SALE', 'RETURN', 'EXCHANGE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "refund_method_enum" AS ENUM ('CASH', 'STORE_CREDIT', 'OFFSET')`,
    );

    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "type" "invoice_type_enum" NOT NULL DEFAULT 'SALE',
        ADD COLUMN "original_invoice_id" uuid NULL,
        ADD COLUMN "refund_method" "refund_method_enum" NULL,
        ADD COLUMN "refunded_amount" numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN "net_amount" numeric(18,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "FK_invoices_original_invoice"
        FOREIGN KEY ("original_invoice_id") REFERENCES "invoices"("id")
        ON DELETE RESTRICT
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_org_original" ON "invoices" ("organization_id", "original_invoice_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_org_original"`);
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "FK_invoices_original_invoice"`,
    );
    await queryRunner.query(`
      ALTER TABLE "invoices"
        DROP COLUMN IF EXISTS "net_amount",
        DROP COLUMN IF EXISTS "refunded_amount",
        DROP COLUMN IF EXISTS "refund_method",
        DROP COLUMN IF EXISTS "original_invoice_id",
        DROP COLUMN IF EXISTS "type"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "refund_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_type_enum"`);
  }
}
