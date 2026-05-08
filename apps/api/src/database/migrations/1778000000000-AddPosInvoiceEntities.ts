import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosInvoiceEntities1778000000000 implements MigrationInterface {
  name = 'AddPosInvoiceEntities1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUM TYPES ──────────────────────────────────────────────────────────

    await queryRunner.query(`CREATE TYPE "invoice_status_enum" AS ENUM ('draft', 'pending', 'paid', 'debt', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "invoice_payment_method_enum" AS ENUM ('cash', 'bank_transfer', 'card', 'debt')`);
    await queryRunner.query(`CREATE TYPE "debt_status_enum" AS ENUM ('open', 'paid', 'overdue')`);
    await queryRunner.query(`CREATE TYPE "debt_document_type_enum" AS ENUM ('credit_invoice', 'payment_receipt', 'adjustment')`);
    await queryRunner.query(`CREATE TYPE "debt_payment_method_enum" AS ENUM ('cash', 'bank_transfer')`);

    // ── invoices ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "code" character varying(20) NOT NULL,
        "issued_at" TIMESTAMP WITH TIME ZONE,
        "status" "invoice_status_enum" NOT NULL DEFAULT 'draft',
        "subtotal" numeric(18,2) NOT NULL DEFAULT 0,
        "discount_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "deposit_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "amount_due" numeric(18,2) NOT NULL DEFAULT 0,
        "payment_method" "invoice_payment_method_enum",
        "cash_tendered" numeric(18,2),
        "change_amount" numeric(18,2),
        "note" text,
        "is_draft" boolean NOT NULL DEFAULT true,
        "session_id" character varying NOT NULL,
        "draft_label" character varying,
        "customer_id" uuid,
        "staff_id" uuid NOT NULL,
        "price_list_id" uuid,
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoices_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoices_staff" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "uq_invoice_org_code" ON "invoices" ("organization_id", "code")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_org_branch_issued_at" ON "invoices" ("organization_id", "branch_id", "issued_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_org_customer" ON "invoices" ("organization_id", "customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_org_session_draft" ON "invoices" ("organization_id", "session_id", "is_draft")`);

    // ── invoice_items ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "invoice_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "invoice_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "item_code" character varying NOT NULL,
        "item_name" character varying NOT NULL,
        "unit" character varying NOT NULL,
        "quantity" numeric(18,2) NOT NULL,
        "unit_price" numeric(18,2) NOT NULL,
        "line_discount" numeric(18,2) NOT NULL DEFAULT 0,
        "line_total" numeric(18,2) NOT NULL,
        "note" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_invoice_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_items_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_items_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_invoice_items_invoice_id" ON "invoice_items" ("invoice_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_items_item_id" ON "invoice_items" ("item_id")`);

    // ── invoice_debts ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "invoice_debts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "reference_code" character varying NOT NULL,
        "invoice_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "document_type" "debt_document_type_enum" NOT NULL,
        "original_amount" numeric(18,2) NOT NULL,
        "paid_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "remaining_amount" numeric(18,2) NOT NULL,
        "issued_at" date NOT NULL,
        "due_date" date,
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "status" "debt_status_enum" NOT NULL DEFAULT 'open',
        "note" text,
        CONSTRAINT "PK_invoice_debts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invoice_debts_invoice_id" UNIQUE ("invoice_id"),
        CONSTRAINT "FK_invoice_debts_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_invoice_debts_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "uq_invoice_debt_invoice" ON "invoice_debts" ("invoice_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_debts_org_customer_status" ON "invoice_debts" ("organization_id", "customer_id", "status")`);

    // ── debt_payments ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "debt_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "debt_id" uuid NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "payment_method" "debt_payment_method_enum" NOT NULL,
        "staff_id" uuid NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "note" text,
        CONSTRAINT "PK_debt_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_debt_payments_debt" FOREIGN KEY ("debt_id") REFERENCES "invoice_debts"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_debt_payments_debt_id" ON "debt_payments" ("debt_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse dependency order
    await queryRunner.query(`DROP TABLE "debt_payments"`);
    await queryRunner.query(`DROP TABLE "invoice_debts"`);
    await queryRunner.query(`DROP TABLE "invoice_items"`);
    await queryRunner.query(`DROP TABLE "invoices"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "debt_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE "debt_document_type_enum"`);
    await queryRunner.query(`DROP TYPE "debt_status_enum"`);
    await queryRunner.query(`DROP TYPE "invoice_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE "invoice_status_enum"`);
  }
}
