import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cash Vouchers — Phase 1 schema.
 *
 * Creates the document-level cash voucher tables on top of the existing
 * cash_accounts / cash_movements infrastructure (EPIC-009):
 *   - cash_receipts / cash_receipt_lines      (Phiếu thu)
 *   - cash_payments / cash_payment_lines      (Phiếu chi)
 *   - cash_counts                             (Kiểm kê tiền mặt)
 *   - cash_voucher_categories                 (Mục thu / Mục chi)
 *
 * `cash_payments.reference_type` ships the full enum (incl. REVERSAL) up front so
 * Phase 2 never needs `ALTER TYPE ... ADD VALUE` (which is not transaction-revertible).
 *
 * DocumentType (CASH_RECEIPT=PT / CASH_PAYMENT=PC / CASH_COUNT=KKQ) already exists in
 * @erp/shared-interfaces — no enum extension here.
 */
export class CashVouchersPhase1781000000000 implements MigrationInterface {
  name = 'CashVouchersPhase1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "cash_receipt_status_enum" AS ENUM ('DRAFT', 'POSTED', 'REVERSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_receipt_purpose_enum" AS ENUM ('OTHER', 'DEBT_COLLECTION', 'POS_SALE', 'OTHER_INCOME')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_receipt_reference_type_enum" AS ENUM ('INVOICE', 'INVOICE_DEBT', 'RECEIVABLE', 'MANUAL', 'REVERSAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_payment_status_enum" AS ENUM ('DRAFT', 'POSTED', 'REVERSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_payment_purpose_enum" AS ENUM ('OTHER', 'SUPPLIER_PAYMENT', 'PURCHASE', 'EXPENSE', 'SALARY', 'REFUND')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_payment_reference_type_enum" AS ENUM ('INVOICE_DEBT', 'GOODS_RECEIPT', 'EXPENSE', 'SALARY', 'REFUND', 'MANUAL', 'REVERSAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_voucher_partner_type_enum" AS ENUM ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_voucher_category_direction_enum" AS ENUM ('IN', 'OUT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_count_status_enum" AS ENUM ('DRAFT', 'POSTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cash_count_variance_voucher_kind_enum" AS ENUM ('CASH_RECEIPT', 'CASH_PAYMENT')`,
    );

    // ---- cash_voucher_categories -------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cash_voucher_categories" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "code"             varchar(32) NOT NULL,
        "name"             varchar(255) NOT NULL,
        "direction"        "cash_voucher_category_direction_enum" NOT NULL,
        "is_active"        boolean NOT NULL DEFAULT true,
        "display_order"    int NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_cash_voucher_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cash_voucher_categories_org_code" UNIQUE ("organization_id", "code")
      )
    `);

    // ---- cash_receipts ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cash_receipts" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"           varchar NOT NULL,
        "branch_id"                 varchar NULL,
        "document_number"           varchar(64) NULL,
        "voucher_date"              date NOT NULL,
        "status"                    "cash_receipt_status_enum" NOT NULL DEFAULT 'DRAFT',
        "purpose"                   "cash_receipt_purpose_enum" NOT NULL DEFAULT 'OTHER',
        "partner_type"              "cash_voucher_partner_type_enum" NULL,
        "partner_id"                uuid NULL,
        "partner_name_snapshot"     varchar(255) NULL,
        "partner_address_snapshot"  varchar(500) NULL,
        "payer_name"                varchar(255) NULL,
        "reason"                    varchar(500) NULL,
        "staff_id"                  uuid NULL,
        "reference_type"            "cash_receipt_reference_type_enum" NULL,
        "reference_id"              uuid NULL,
        "cash_account_id"           uuid NOT NULL,
        "contra_account_id"         uuid NOT NULL,
        "total_amount"              numeric(18,2) NOT NULL DEFAULT 0,
        "attachment_ids"            jsonb NOT NULL DEFAULT '[]'::jsonb,
        "cash_movement_id"          uuid NULL,
        "journal_entry_id"          uuid NULL,
        "reversed_by_voucher_id"    uuid NULL,
        "reverses_voucher_id"       uuid NULL,
        "reversal_reason"           varchar(500) NULL,
        "posted_at"                 timestamptz NULL,
        "posted_by"                 uuid NULL,
        "created_at"                TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"                TIMESTAMP NULL,
        "created_by"                varchar NOT NULL,
        CONSTRAINT "PK_cash_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cash_receipts_cash_account"
          FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_receipts_contra_account"
          FOREIGN KEY ("contra_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_receipts_cash_movement"
          FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_receipts_journal_entry"
          FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_receipts_reversed_by"
          FOREIGN KEY ("reversed_by_voucher_id") REFERENCES "cash_receipts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_receipts_reverses"
          FOREIGN KEY ("reverses_voucher_id") REFERENCES "cash_receipts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_receipts_org_status" ON "cash_receipts" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_receipts_org_voucher_date" ON "cash_receipts" ("organization_id", "voucher_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_receipts_account_voucher_date" ON "cash_receipts" ("cash_account_id", "voucher_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_receipts_movement" ON "cash_receipts" ("cash_movement_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_cash_receipts_org_document_number" ON "cash_receipts" ("organization_id", "document_number") WHERE "document_number" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_cash_receipts_reversal" ON "cash_receipts" ("reference_id") WHERE "reference_type" = 'REVERSAL' AND "deleted_at" IS NULL`,
    );

    // ---- cash_receipt_lines -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cash_receipt_lines" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "cash_receipt_id"  uuid NOT NULL,
        "line_order"       int NOT NULL DEFAULT 0,
        "description"      varchar(500) NOT NULL,
        "category_id"      uuid NULL,
        "amount"           numeric(18,2) NOT NULL,
        "reference_note"   varchar(255) NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_cash_receipt_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cash_receipt_lines_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_cash_receipt_lines_receipt"
          FOREIGN KEY ("cash_receipt_id") REFERENCES "cash_receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cash_receipt_lines_category"
          FOREIGN KEY ("category_id") REFERENCES "cash_voucher_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_receipt_lines_receipt" ON "cash_receipt_lines" ("cash_receipt_id")`,
    );

    // ---- cash_payments ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cash_payments" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"           varchar NOT NULL,
        "branch_id"                 varchar NULL,
        "document_number"           varchar(64) NULL,
        "voucher_date"              date NOT NULL,
        "status"                    "cash_payment_status_enum" NOT NULL DEFAULT 'DRAFT',
        "purpose"                   "cash_payment_purpose_enum" NOT NULL DEFAULT 'OTHER',
        "partner_type"              "cash_voucher_partner_type_enum" NULL,
        "partner_id"                uuid NULL,
        "partner_name_snapshot"     varchar(255) NULL,
        "partner_address_snapshot"  varchar(500) NULL,
        "payee_name"                varchar(255) NULL,
        "reason"                    varchar(500) NULL,
        "staff_id"                  uuid NULL,
        "reference_type"            "cash_payment_reference_type_enum" NULL,
        "reference_id"              uuid NULL,
        "cash_account_id"           uuid NOT NULL,
        "contra_account_id"         uuid NOT NULL,
        "total_amount"              numeric(18,2) NOT NULL DEFAULT 0,
        "attachment_ids"            jsonb NOT NULL DEFAULT '[]'::jsonb,
        "cash_movement_id"          uuid NULL,
        "journal_entry_id"          uuid NULL,
        "reversed_by_voucher_id"    uuid NULL,
        "reverses_voucher_id"       uuid NULL,
        "reversal_reason"           varchar(500) NULL,
        "posted_at"                 timestamptz NULL,
        "posted_by"                 uuid NULL,
        "created_at"                TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"                TIMESTAMP NULL,
        "created_by"                varchar NOT NULL,
        CONSTRAINT "PK_cash_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cash_payments_cash_account"
          FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_payments_contra_account"
          FOREIGN KEY ("contra_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_payments_cash_movement"
          FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_payments_journal_entry"
          FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_payments_reversed_by"
          FOREIGN KEY ("reversed_by_voucher_id") REFERENCES "cash_payments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_payments_reverses"
          FOREIGN KEY ("reverses_voucher_id") REFERENCES "cash_payments"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_payments_org_status" ON "cash_payments" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_payments_org_voucher_date" ON "cash_payments" ("organization_id", "voucher_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_payments_account_voucher_date" ON "cash_payments" ("cash_account_id", "voucher_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_payments_movement" ON "cash_payments" ("cash_movement_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_cash_payments_org_document_number" ON "cash_payments" ("organization_id", "document_number") WHERE "document_number" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_cash_payments_reversal" ON "cash_payments" ("reference_id") WHERE "reference_type" = 'REVERSAL' AND "deleted_at" IS NULL`,
    );

    // ---- cash_payment_lines -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cash_payment_lines" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "cash_payment_id"  uuid NOT NULL,
        "line_order"       int NOT NULL DEFAULT 0,
        "description"      varchar(500) NOT NULL,
        "category_id"      uuid NULL,
        "amount"           numeric(18,2) NOT NULL,
        "reference_note"   varchar(255) NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_cash_payment_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cash_payment_lines_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_cash_payment_lines_payment"
          FOREIGN KEY ("cash_payment_id") REFERENCES "cash_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cash_payment_lines_category"
          FOREIGN KEY ("category_id") REFERENCES "cash_voucher_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_payment_lines_payment" ON "cash_payment_lines" ("cash_payment_id")`,
    );

    // ---- cash_counts --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cash_counts" (
        "id"                          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"             varchar NOT NULL,
        "branch_id"                   varchar NULL,
        "document_number"             varchar(64) NULL,
        "cash_account_id"             uuid NOT NULL,
        "counted_at"                  timestamptz NOT NULL,
        "expected_amount"             numeric(18,2) NULL,
        "actual_amount"               numeric(18,2) NOT NULL,
        "variance"                    numeric(18,2) NULL,
        "status"                      "cash_count_status_enum" NOT NULL DEFAULT 'DRAFT',
        "notes"                       text NULL,
        "denominations"               jsonb NULL,
        "variance_cash_movement_id"   uuid NULL,
        "variance_voucher_kind"       "cash_count_variance_voucher_kind_enum" NULL,
        "variance_voucher_id"         uuid NULL,
        "posted_at"                   timestamptz NULL,
        "posted_by"                   uuid NULL,
        "created_at"                  TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"                  TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"                  TIMESTAMP NULL,
        "created_by"                  varchar NOT NULL,
        CONSTRAINT "PK_cash_counts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cash_counts_cash_account"
          FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_counts_variance_movement"
          FOREIGN KEY ("variance_cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_counts_org_status" ON "cash_counts" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_counts_account_counted_at" ON "cash_counts" ("cash_account_id", "counted_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_cash_counts_org_document_number" ON "cash_counts" ("organization_id", "document_number") WHERE "document_number" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_counts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_payment_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_receipt_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_receipts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_voucher_categories"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "cash_count_variance_voucher_kind_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_count_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_voucher_category_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_voucher_partner_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_payment_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_payment_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_receipt_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_receipt_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_receipt_status_enum"`);
  }
}
