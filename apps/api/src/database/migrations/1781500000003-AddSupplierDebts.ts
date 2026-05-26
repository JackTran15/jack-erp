import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supplier-debt ledger ("nợ NCC"): the accounts-payable counterpart of
 * `invoice_debts`. A `supplier_debts` row is created (1-1) when a goods receipt
 * is posted on CREDIT, and reduced by `supplier_debt_payments` instalments
 * recorded from a Phiếu chi (cash payment). Mirrors the customer-side schema in
 * 1778000000000-AddPosInvoiceEntities.
 */
export class AddSupplierDebts1781500000003 implements MigrationInterface {
  name = 'AddSupplierDebts1781500000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "supplier_debt_status_enum" AS ENUM ('open', 'paid', 'overdue');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "supplier_debt_document_type_enum" AS ENUM ('goods_receipt', 'adjustment');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "supplier_debt_payment_method_enum" AS ENUM ('cash', 'bank_transfer');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supplier_debts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "reference_code" character varying NOT NULL,
        "goods_receipt_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "document_type" "supplier_debt_document_type_enum" NOT NULL DEFAULT 'goods_receipt',
        "original_amount" numeric(18,2) NOT NULL,
        "paid_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "remaining_amount" numeric(18,2) NOT NULL,
        "issued_at" date NOT NULL,
        "due_date" date,
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "status" "supplier_debt_status_enum" NOT NULL DEFAULT 'open',
        "note" text,
        CONSTRAINT "PK_supplier_debts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_supplier_debts_goods_receipt_id" UNIQUE ("goods_receipt_id"),
        CONSTRAINT "FK_supplier_debts_goods_receipt" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_supplier_debts_supplier" FOREIGN KEY ("supplier_id") REFERENCES "inventory_providers"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_supplier_debt_goods_receipt" ON "supplier_debts" ("goods_receipt_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_supplier_debts_org_supplier_status" ON "supplier_debts" ("organization_id", "supplier_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supplier_debt_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "debt_id" uuid NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "payment_method" "supplier_debt_payment_method_enum" NOT NULL,
        "staff_id" uuid NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "note" text,
        "cash_payment_id" uuid,
        "journal_entry_id" uuid,
        CONSTRAINT "PK_supplier_debt_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_supplier_debt_payments_debt" FOREIGN KEY ("debt_id") REFERENCES "supplier_debts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_supplier_debt_payments_cash_payment" FOREIGN KEY ("cash_payment_id") REFERENCES "cash_payments"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_supplier_debt_payments_debt_id" ON "supplier_debt_payments" ("debt_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_debt_payments_debt_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_debt_payments"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_debts_org_supplier_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_supplier_debt_goods_receipt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_debts"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "supplier_debt_payment_method_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "supplier_debt_document_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "supplier_debt_status_enum"`);
  }
}
