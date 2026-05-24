import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payment accounts & default-account config — base tables for EPIC2405.
 *
 *   - payment_accounts          maps a POS payment method (cash/bank_transfer/card)
 *                               to a receiving COA account, scoped to org+branch,
 *                               with structured bank columns for display.
 *   - accounting_default_account default COA account per role (REVENUE/RECEIVABLE),
 *                               branch override (branch_id set) or org default
 *                               (branch_id NULL).
 *
 * Both enum values REVENUE/RECEIVABLE ship up front so later phases never need
 * `ALTER TYPE ... ADD VALUE` (not transaction-revertible — cash-vouchers lesson).
 *
 * payment_accounts.branch_id is NOT NULL by design (always branch-scoped),
 * diverging from BaseEntity's nullable branch_id.
 */
export class PaymentAccountsAndDefaultAccounts1781300000000
  implements MigrationInterface
{
  name = 'PaymentAccountsAndDefaultAccounts1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "payment_account_method_enum" AS ENUM ('cash', 'bank_transfer', 'card')`,
    );
    await queryRunner.query(
      `CREATE TYPE "accounting_default_account_role_enum" AS ENUM ('REVENUE', 'RECEIVABLE')`,
    );

    // ---- payment_accounts ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "payment_accounts" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NOT NULL,
        "payment_method"   "payment_account_method_enum" NOT NULL,
        "account_id"       uuid NOT NULL,
        "bank_name"        varchar(200) NULL,
        "bank_code"        varchar(50) NULL,
        "account_number"   varchar(50) NULL,
        "label"            varchar(255) NULL,
        "is_active"        boolean NOT NULL DEFAULT true,
        "sort_order"       int NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_payment_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_accounts_account"
          FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_accounts_org_branch" ON "payment_accounts" ("organization_id", "branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_accounts_account" ON "payment_accounts" ("account_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_branch_method_account" ON "payment_accounts" ("organization_id", "branch_id", "payment_method", "account_id") WHERE "deleted_at" IS NULL`,
    );

    // ---- accounting_default_account -----------------------------------------
    await queryRunner.query(`
      CREATE TABLE "accounting_default_account" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "account_role"     "accounting_default_account_role_enum" NOT NULL,
        "account_id"       uuid NOT NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_accounting_default_account" PRIMARY KEY ("id"),
        CONSTRAINT "FK_accounting_default_account_account"
          FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
      )
    `);
    // Postgres treats NULLs as distinct in unique indexes, so a single unique
    // index over (org, branch_id, role) would not constrain org defaults
    // (branch_id IS NULL). Split into two partial unique indexes.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_accounting_default_account_org_role" ON "accounting_default_account" ("organization_id", "account_role") WHERE "branch_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_accounting_default_account_org_branch_role" ON "accounting_default_account" ("organization_id", "branch_id", "account_role") WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_default_account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_accounts"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "accounting_default_account_role_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_account_method_enum"`);
  }
}
