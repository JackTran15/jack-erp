import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deposit Vouchers (Phiếu thu/chi tiền gửi) — GĐ2 schema (EPIC-15072026 / TKT-DFS-01).
 *
 * Document-level voucher tables on top of the GĐ1 deposit fund (deposit_accounts /
 * deposit_movements), mirroring cash_receipts / cash_payments:
 *   - bank_receipts / bank_receipt_lines   (Phiếu thu, NTTK)
 *   - bank_payments / bank_payment_lines    (Phiếu chi, UNC)
 *
 * Each voucher requires deposit_account_id (FR-04 "Tài khoản nhận" / FR-05 "Tài khoản chi",
 * the gap in ref.md §13) and, when POSTED, links a deposit_movements row + a journal_entries row.
 * org/branch are varchar to match cash_* and the GĐ1 deposit tables. Full reference-type enums
 * ship up front so GĐ3/GĐ4 never need ALTER TYPE ADD VALUE (not transaction-revertible).
 */
export class DepositVouchersSchema1786600000000 implements MigrationInterface {
  name = 'DepositVouchersSchema1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "bank_voucher_status_enum" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REVERSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_receipt_purpose_enum" AS ENUM ('OTHER', 'DEBT_COLLECTION', 'OTHER_INCOME', 'INTER_BRANCH_IN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_receipt_reference_type_enum" AS ENUM ('INVOICE_DEBT', 'RECEIVABLE', 'TRANSFER', 'MANUAL', 'REVERSAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_payment_purpose_enum" AS ENUM ('SUPPLIER_PAYMENT', 'PURCHASE', 'EXPENSE', 'CASH_TRANSFER', 'INTER_BRANCH_OUT', 'REFUND', 'BANK_FEE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_payment_reference_type_enum" AS ENUM ('GOODS_RECEIPT', 'PAYABLE', 'INVOICE', 'TRANSFER', 'EXPENSE', 'MANUAL', 'REVERSAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_voucher_partner_type_enum" AS ENUM ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER')`,
    );

    // ---- bank_receipts ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "bank_receipts" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"           varchar NOT NULL,
        "branch_id"                 varchar NOT NULL,
        "deposit_account_id"        uuid NOT NULL,
        "document_number"           varchar(64) NULL,
        "purpose"                   "bank_receipt_purpose_enum" NOT NULL DEFAULT 'OTHER',
        "status"                    "bank_voucher_status_enum" NOT NULL DEFAULT 'DRAFT',
        "doc_date"                  date NOT NULL,
        "partner_type"              "bank_voucher_partner_type_enum" NULL,
        "partner_id"                uuid NULL,
        "partner_name_snapshot"     varchar(255) NULL,
        "partner_address_snapshot"  varchar(500) NULL,
        "payer_name"                varchar(255) NULL,
        "reason"                    varchar(500) NULL,
        "collected_by"              varchar NULL,
        "reference"                 varchar(255) NULL,
        "affect_revenue"            boolean NOT NULL DEFAULT false,
        "contra_account_id"         uuid NULL,
        "total_amount"              numeric(18,2) NOT NULL DEFAULT 0,
        "attachment_ids"            jsonb NOT NULL DEFAULT '[]'::jsonb,
        "reference_type"            "bank_receipt_reference_type_enum" NULL,
        "reference_id"              uuid NULL,
        "deposit_movement_id"       uuid NULL,
        "journal_entry_id"          uuid NULL,
        "reverses_voucher_id"       uuid NULL,
        "reversed_by_voucher_id"    uuid NULL,
        "reversal_reason"           text NULL,
        "posted_at"                 timestamptz NULL,
        "posted_by"                 varchar NULL,
        "created_at"                timestamptz NOT NULL DEFAULT now(),
        "updated_at"                timestamptz NOT NULL DEFAULT now(),
        "deleted_at"                timestamptz NULL,
        "created_by"                varchar NOT NULL,
        CONSTRAINT "PK_bank_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bank_receipts_deposit_account"
          FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_receipts_contra_account"
          FOREIGN KEY ("contra_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_receipts_movement"
          FOREIGN KEY ("deposit_movement_id") REFERENCES "deposit_movements"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_receipts_journal_entry"
          FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_receipts_reversed_by"
          FOREIGN KEY ("reversed_by_voucher_id") REFERENCES "bank_receipts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_receipts_reverses"
          FOREIGN KEY ("reverses_voucher_id") REFERENCES "bank_receipts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_bank_receipts_scope" ON "bank_receipts" ("organization_id", "branch_id", "deposit_account_id", "doc_date", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bank_receipts_movement" ON "bank_receipts" ("deposit_movement_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_bank_receipts_org_document_number" ON "bank_receipts" ("organization_id", "document_number") WHERE "document_number" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_bank_receipts_reversal" ON "bank_receipts" ("reference_id") WHERE "reference_type" = 'REVERSAL' AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_bank_receipts_reference" ON "bank_receipts" ("organization_id", "reference_type", "reference_id") WHERE "reference_type" IS NOT NULL AND "reference_id" IS NOT NULL AND "status" != 'REVERSED' AND "deleted_at" IS NULL`,
    );

    // ---- bank_receipt_lines -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "bank_receipt_lines" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NOT NULL,
        "bank_receipt_id"  uuid NOT NULL,
        "line_order"       int NOT NULL DEFAULT 0,
        "description"      varchar(500) NOT NULL,
        "category_id"      uuid NULL,
        "amount"           numeric(18,2) NOT NULL,
        "reference_note"   varchar(255) NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_bank_receipt_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_bank_receipt_lines_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_bank_receipt_lines_receipt"
          FOREIGN KEY ("bank_receipt_id") REFERENCES "bank_receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bank_receipt_lines_category"
          FOREIGN KEY ("category_id") REFERENCES "cash_voucher_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bank_receipt_lines_receipt" ON "bank_receipt_lines" ("bank_receipt_id")`,
    );

    // ---- bank_payments ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "bank_payments" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"           varchar NOT NULL,
        "branch_id"                 varchar NOT NULL,
        "deposit_account_id"        uuid NOT NULL,
        "document_number"           varchar(64) NULL,
        "purpose"                   "bank_payment_purpose_enum" NOT NULL DEFAULT 'OTHER',
        "status"                    "bank_voucher_status_enum" NOT NULL DEFAULT 'DRAFT',
        "doc_date"                  date NOT NULL,
        "partner_type"              "bank_voucher_partner_type_enum" NULL,
        "partner_id"                uuid NULL,
        "partner_name_snapshot"     varchar(255) NULL,
        "partner_address_snapshot"  varchar(500) NULL,
        "payee_name"                varchar(255) NULL,
        "reason"                    varchar(500) NULL,
        "paid_by"                   varchar NULL,
        "reference"                 varchar(255) NULL,
        "affect_expense"            boolean NOT NULL DEFAULT false,
        "contra_account_id"         uuid NULL,
        "total_amount"              numeric(18,2) NOT NULL DEFAULT 0,
        "attachment_ids"            jsonb NOT NULL DEFAULT '[]'::jsonb,
        "reference_type"            "bank_payment_reference_type_enum" NULL,
        "reference_id"              uuid NULL,
        "approval_status"           varchar NULL,
        "approved_by"               uuid NULL,
        "approved_at"               timestamptz NULL,
        "deposit_movement_id"       uuid NULL,
        "journal_entry_id"          uuid NULL,
        "reverses_voucher_id"       uuid NULL,
        "reversed_by_voucher_id"    uuid NULL,
        "reversal_reason"           text NULL,
        "posted_at"                 timestamptz NULL,
        "posted_by"                 varchar NULL,
        "created_at"                timestamptz NOT NULL DEFAULT now(),
        "updated_at"                timestamptz NOT NULL DEFAULT now(),
        "deleted_at"                timestamptz NULL,
        "created_by"                varchar NOT NULL,
        CONSTRAINT "PK_bank_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bank_payments_deposit_account"
          FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_payments_contra_account"
          FOREIGN KEY ("contra_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_payments_movement"
          FOREIGN KEY ("deposit_movement_id") REFERENCES "deposit_movements"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_payments_journal_entry"
          FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_payments_reversed_by"
          FOREIGN KEY ("reversed_by_voucher_id") REFERENCES "bank_payments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_payments_reverses"
          FOREIGN KEY ("reverses_voucher_id") REFERENCES "bank_payments"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_bank_payments_scope" ON "bank_payments" ("organization_id", "branch_id", "deposit_account_id", "doc_date", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bank_payments_movement" ON "bank_payments" ("deposit_movement_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_bank_payments_org_document_number" ON "bank_payments" ("organization_id", "document_number") WHERE "document_number" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_bank_payments_reversal" ON "bank_payments" ("reference_id") WHERE "reference_type" = 'REVERSAL' AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_bank_payments_reference" ON "bank_payments" ("organization_id", "reference_type", "reference_id") WHERE "reference_type" IS NOT NULL AND "reference_id" IS NOT NULL AND "status" != 'REVERSED' AND "deleted_at" IS NULL`,
    );

    // ---- bank_payment_lines -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "bank_payment_lines" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NOT NULL,
        "bank_payment_id"  uuid NOT NULL,
        "line_order"       int NOT NULL DEFAULT 0,
        "description"      varchar(500) NOT NULL,
        "category_id"      uuid NULL,
        "amount"           numeric(18,2) NOT NULL,
        "reference_note"   varchar(255) NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_bank_payment_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_bank_payment_lines_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_bank_payment_lines_payment"
          FOREIGN KEY ("bank_payment_id") REFERENCES "bank_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bank_payment_lines_category"
          FOREIGN KEY ("category_id") REFERENCES "cash_voucher_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bank_payment_lines_payment" ON "bank_payment_lines" ("bank_payment_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_payment_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_receipt_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_receipts"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "bank_voucher_partner_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bank_payment_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bank_payment_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bank_receipt_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bank_receipt_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bank_voucher_status_enum"`);
  }
}
