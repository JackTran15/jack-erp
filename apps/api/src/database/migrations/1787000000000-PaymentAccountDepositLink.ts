import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a `payment_accounts` row directly to a specific `deposit_accounts` row,
 * and carries that explicit choice through to `invoice_payments`.
 *
 * Before this: `payment_accounts` only stored a bare COA id (`account_id`) plus
 * free-text bank display fields (`bank_name`/`bank_code`/`account_number`) that
 * were never used for routing. When two `deposit_accounts` rows shared the same
 * COA, the POS deposit consumer had no way to tell which one a cashier's
 * `payment_accounts` selection actually meant — it re-derived the fund purely
 * from the COA and threw "Ambiguous deposit COA" (TKT-DF-04's
 * `DepositRoutingService`) even though the cashier had already picked an exact
 * account at checkout.
 *
 * After this: a non-cash `payment_accounts` row can carry `deposit_account_id`
 * directly. `invoice_payments.deposit_account_id` records which deposit account
 * that specific payment line resolved to (nullable — cash lines and any
 * payment_accounts row without a linked deposit account leave it null, falling
 * back to the existing COA-based auto-resolution unchanged). The free-text bank
 * display columns are dropped — `deposit_accounts` already owns that data
 * properly (bank + account number), so duplicating it on `payment_accounts` was
 * dead data, never read by any routing logic.
 *
 * The two partial unique indexes are widened to include `deposit_account_id`.
 * Without it they key on (org[, branch], method, account_id), which makes the
 * exact case this column exists for — two deposit funds sharing one COA, each
 * reachable as its own POS payment option — unrepresentable: both rows collapse
 * to the same key and the second insert is rejected. `NULLS NOT DISTINCT` keeps
 * the previous strictness for rows with no linked fund (cash, and pre-existing
 * unlinked mappings), which would otherwise become freely duplicable since
 * Postgres treats NULLs in a unique index as distinct by default.
 */
export class PaymentAccountDepositLink1787000000000 implements MigrationInterface {
  name = 'PaymentAccountDepositLink1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_accounts"
        ADD COLUMN "deposit_account_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_accounts"
        ADD CONSTRAINT "FK_payment_accounts_deposit_account"
        FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_payment_accounts_deposit_account" ON "payment_accounts" ("deposit_account_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_accounts"
        DROP COLUMN "bank_name",
        DROP COLUMN "bank_code",
        DROP COLUMN "account_number"
    `);

    await queryRunner.query(`
      ALTER TABLE "invoice_payments"
        ADD COLUMN "deposit_account_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "invoice_payments"
        ADD CONSTRAINT "FK_invoice_payments_deposit_account"
        FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT
    `);

    // Widen both partial unique indexes to include the linked deposit fund.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_method_account"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_method_account" ON "payment_accounts" ("organization_id", "payment_method", "account_id", "deposit_account_id") NULLS NOT DISTINCT WHERE "branch_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_branch_method_account"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_branch_method_account" ON "payment_accounts" ("organization_id", "branch_id", "payment_method", "account_id", "deposit_account_id") NULLS NOT DISTINCT WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Narrow the unique indexes back before the column they reference is dropped.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_method_account"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_method_account" ON "payment_accounts" ("organization_id", "payment_method", "account_id") WHERE "branch_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_branch_method_account"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_branch_method_account" ON "payment_accounts" ("organization_id", "branch_id", "payment_method", "account_id") WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "invoice_payments"
        DROP CONSTRAINT IF EXISTS "FK_invoice_payments_deposit_account"
    `);
    await queryRunner.query(`
      ALTER TABLE "invoice_payments"
        DROP COLUMN IF EXISTS "deposit_account_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_accounts"
        ADD COLUMN "bank_name" varchar(200) NULL,
        ADD COLUMN "bank_code" varchar(50) NULL,
        ADD COLUMN "account_number" varchar(50) NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_accounts_deposit_account"`);
    await queryRunner.query(`
      ALTER TABLE "payment_accounts"
        DROP CONSTRAINT IF EXISTS "FK_payment_accounts_deposit_account"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_accounts"
        DROP COLUMN IF EXISTS "deposit_account_id"
    `);
  }
}
