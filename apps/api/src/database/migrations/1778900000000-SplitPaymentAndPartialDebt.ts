import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitPaymentAndPartialDebt1778900000000 implements MigrationInterface {
  name = 'SplitPaymentAndPartialDebt1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add PARTIAL_DEBT to invoice status enum
    await queryRunner.query(`ALTER TYPE "invoice_status_enum" ADD VALUE IF NOT EXISTS 'partial_debt'`);

    // 2. Create invoice_payments table
    await queryRunner.query(`
      CREATE TABLE "invoice_payments" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "invoice_id"     UUID        NOT NULL,
        "payment_method" TEXT        NOT NULL,
        "amount"         NUMERIC(18,2) NOT NULL,
        "account_id"     UUID        NOT NULL,
        "reference"      VARCHAR(255),
        "organization_id" UUID       NOT NULL,
        "branch_id"      UUID        NOT NULL,
        "created_by"     UUID,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoice_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_payments_invoice_id" ON "invoice_payments" ("invoice_id")`);

    // 3. Add total_paid column to invoices
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN "total_paid" NUMERIC(18,2) NOT NULL DEFAULT 0`);

    // 4. Drop old single-payment columns from invoices
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "payment_method"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "cash_tendered"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "change_amount"`);

    // 5. Recreate invoice_payment_method_enum without 'debt'
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_payment_method_enum') THEN
          DROP TYPE "invoice_payment_method_enum";
        END IF;
      END$$
    `);
    await queryRunner.query(`CREATE TYPE "invoice_payment_method_enum" AS ENUM ('cash', 'bank_transfer', 'card')`);

    // 6. Apply proper enum type to invoice_payments.payment_method
    await queryRunner.query(`
      ALTER TABLE "invoice_payments"
        ALTER COLUMN "payment_method" TYPE "invoice_payment_method_enum"
        USING "payment_method"::"invoice_payment_method_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_payments"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "total_paid"`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN "payment_method" VARCHAR`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN "cash_tendered" NUMERIC(18,2)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN "change_amount" NUMERIC(18,2)`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_payment_method_enum"`);
    await queryRunner.query(`CREATE TYPE "invoice_payment_method_enum" AS ENUM ('cash', 'bank_transfer', 'card', 'debt')`);
  }
}
