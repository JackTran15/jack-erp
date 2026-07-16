import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deposit Fund (Quỹ tiền gửi) — Foundation schema (EPIC-15072026, GĐ1 / TKT-DF-01).
 *
 * Creates the four foundation tables for the branch-scoped deposit fund, mirroring the
 * cash_accounts / cash_movements structure and adding deposit-specific columns
 * (reconciliation, fee/net, value_date):
 *   - banks                    (bank catalogue, generic CRUD, org-scoped)
 *   - deposit_accounts         (bank / e-wallet / POS-merchant fund; branch_id NOT NULL)
 *   - deposit_movements        (append-only ledger + recon/fee/value_date)
 *   - deposit_payment_policy   (thin deposit economics; reuses payment_accounts for method→COA)
 *
 * Financial guards:
 *   - UNIQUE(source, source_ref_id, source_ref_line_id) on deposit_movements blocks POS
 *     double-post at the DB layer at PAYMENT-LINE grain (finer than the cash model's
 *     invoice grain). Postgres NULLS DISTINCT lets MANUAL rows (ref NULL) coexist.
 *   - Partial UNIQUE enforces exactly one is_default deposit account per branch.
 *
 * target_fund is NOT stored: a non-cash payment line routes to the deposit fund iff its
 * resolved COA (invoice_payments.account_id) matches an ACTIVE deposit_accounts.account_id
 * in the same org+branch (see TKT-DF-04). payment_accounts (method→COA) is reused as-is.
 *
 * DocumentType BANK_RECEIPT (NTTK) / BANK_PAYMENT (UNC) / RECONCILIATION (DS) already exist
 * in @erp/shared-interfaces — no enum extension here.
 */
export class DepositFundFoundation1786500000000 implements MigrationInterface {
  name = 'DepositFundFoundation1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "deposit_account_type_enum" AS ENUM ('BANK_ACCOUNT', 'EWALLET', 'POS_MERCHANT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "deposit_account_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "deposit_movement_type_enum" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'ADJUSTMENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "deposit_movement_source_enum" AS ENUM ('POS_INVOICE', 'MANUAL', 'TRANSFER', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "deposit_recon_status_enum" AS ENUM ('CHUA', 'DA', 'LECH')`,
    );
    await queryRunner.query(
      `CREATE TYPE "deposit_transfer_status_enum" AS ENUM ('DANG_CHUYEN', 'HOAN_TAT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "fee_bearer_enum" AS ENUM ('MERCHANT', 'CUSTOMER')`,
    );

    // ---- banks --------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "banks" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "code"             varchar(50) NOT NULL,
        "name"             varchar(200) NOT NULL,
        "short_name"       varchar(100) NULL,
        "is_active"        boolean NOT NULL DEFAULT true,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_banks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_banks_org_code" ON "banks" ("organization_id", "code") WHERE "deleted_at" IS NULL`,
    );

    // ---- deposit_accounts ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "deposit_accounts" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NOT NULL,
        "name"             varchar(200) NOT NULL,
        "code"             varchar(50) NOT NULL,
        "account_no"       varchar(50) NOT NULL,
        "account_name"     varchar(200) NOT NULL,
        "bank_id"          uuid NOT NULL,
        "bank_branch"      varchar(200) NULL,
        "type"             "deposit_account_type_enum" NOT NULL,
        "mid"              varchar(50) NULL,
        "tid"              varchar(50) NULL,
        "account_id"       uuid NOT NULL,
        "opening_balance"  numeric(18,2) NOT NULL DEFAULT 0,
        "opening_date"     date NOT NULL,
        "balance"          numeric(18,2) NOT NULL DEFAULT 0,
        "allow_negative"   boolean NOT NULL DEFAULT false,
        "is_default"       boolean NOT NULL DEFAULT false,
        "status"           "deposit_account_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_deposit_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposit_accounts_bank"
          FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_accounts_account"
          FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_deposit_accounts_org_branch" ON "deposit_accounts" ("organization_id", "branch_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_deposit_accounts_org_code" ON "deposit_accounts" ("organization_id", "code") WHERE "deleted_at" IS NULL`,
    );
    // Exactly one default deposit account per branch (BR-ACC-03).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_deposit_accounts_default" ON "deposit_accounts" ("branch_id") WHERE "is_default" = true AND "deleted_at" IS NULL`,
    );

    // ---- deposit_movements (append-only; no soft delete) --------------------
    await queryRunner.query(`
      CREATE TABLE "deposit_movements" (
        "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"     varchar NOT NULL,
        "branch_id"           varchar NOT NULL,
        "deposit_account_id"  uuid NOT NULL,
        "to_account_id"       uuid NULL,
        "type"                "deposit_movement_type_enum" NOT NULL,
        "amount"              numeric(18,2) NOT NULL,
        "fee_amount"          numeric(18,2) NOT NULL DEFAULT 0,
        "net_amount"          numeric(18,2) NOT NULL,
        "doc_date"            date NOT NULL,
        "value_date"          date NULL,
        "recon_status"        "deposit_recon_status_enum" NOT NULL DEFAULT 'CHUA',
        "recon_batch_id"      uuid NULL,
        "reconciled_by"       varchar NULL,
        "reconciled_at"       timestamptz NULL,
        "source"              "deposit_movement_source_enum" NOT NULL,
        "source_ref_id"       uuid NULL,
        "source_ref_line_id"  uuid NULL,
        "journal_entry_id"    uuid NULL,
        "transfer_pair_id"    uuid NULL,
        "transfer_status"     "deposit_transfer_status_enum" NULL,
        "document_number"     varchar(64) NULL,
        "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"          varchar NOT NULL,
        CONSTRAINT "PK_deposit_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposit_movements_account"
          FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_movements_to_account"
          FOREIGN KEY ("to_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_movements_journal_entry"
          FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL
      )
    `);
    // D2 / R3 / BR-POS-01: block double-post at payment-line grain (NULLS DISTINCT keeps MANUAL rows independent).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_deposit_movements_source_ref" ON "deposit_movements" ("source", "source_ref_id", "source_ref_line_id")`,
    );
    // NFR-01: detail-ledger index.
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_movements_ledger" ON "deposit_movements" ("organization_id", "branch_id", "deposit_account_id", "doc_date", "id")`,
    );
    // Ledger must also surface transfers received into an account (to_account_id side).
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_movements_to_account" ON "deposit_movements" ("to_account_id", "doc_date") WHERE "to_account_id" IS NOT NULL`,
    );

    // ---- deposit_payment_policy (thin; reuses payment_accounts for method→COA) ----
    await queryRunner.query(`
      CREATE TABLE "deposit_payment_policy" (
        "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"     varchar NOT NULL,
        "branch_id"           varchar NULL,
        "payment_method"      varchar(50) NOT NULL,
        "card_type"           varchar(50) NULL,
        "deposit_account_id"  uuid NULL,
        "fee_rate"            numeric(9,4) NOT NULL DEFAULT 0,
        "fee_bearer"          "fee_bearer_enum" NULL,
        "settlement_days"     int NOT NULL DEFAULT 0,
        "effective_from"      date NOT NULL DEFAULT CURRENT_DATE,
        "effective_to"        date NULL,
        "is_active"           boolean NOT NULL DEFAULT true,
        "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMP NULL,
        "created_by"          varchar NOT NULL,
        CONSTRAINT "PK_deposit_payment_policy" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposit_payment_policy_account"
          FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_payment_policy_lookup" ON "deposit_payment_policy" ("organization_id", "branch_id", "payment_method")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_payment_policy"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "banks"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "fee_bearer_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_transfer_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_recon_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_movement_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_movement_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_account_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_account_type_enum"`);
  }
}
