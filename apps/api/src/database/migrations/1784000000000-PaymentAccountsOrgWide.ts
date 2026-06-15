import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make payment_accounts org-wide.
 *
 * Originally every payment-method -> COA mapping was branch-scoped (branch_id NOT
 * NULL), so a branch created at runtime had no mappings and could not check out.
 * A mapping is now either org-wide (branch_id NULL, the shared default for every
 * branch) or a branch override (branch_id set), mirroring accounting_default_account.
 *
 * Existing per-branch rows are collapsed into one org-wide set per
 * (organization_id, payment_method, account_id): the branches in each org all point
 * at the same COA accounts, so this changes no GL posting. Methods that legitimately
 * carry more than one account (e.g. two banks) keep one org-wide row per account,
 * preserving the resolver's "ambiguous -> require paymentAccountId" behaviour.
 */
export class PaymentAccountsOrgWide1784000000000 implements MigrationInterface {
  name = 'PaymentAccountsOrgWide1784000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // branch_id becomes nullable (NULL = org-wide default).
    await qr.query(
      `ALTER TABLE "payment_accounts" ALTER COLUMN "branch_id" DROP NOT NULL`,
    );

    // Collapse per-branch rows into one org-wide row per (org, method, account).
    await qr.query(`
      INSERT INTO "payment_accounts"
        ("organization_id", "branch_id", "payment_method", "account_id",
         "bank_name", "bank_code", "account_number", "label",
         "is_active", "sort_order", "created_by")
      SELECT DISTINCT ON (organization_id, payment_method, account_id)
             organization_id, NULL, payment_method, account_id,
             bank_name, bank_code, account_number, label,
             true, sort_order, created_by
      FROM "payment_accounts"
      WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL
      ORDER BY organization_id, payment_method, account_id, created_at
    `);
    await qr.query(`DELETE FROM "payment_accounts" WHERE "branch_id" IS NOT NULL`);

    // Replace the single unique index with two partial indexes: org-wide rows are
    // unique per (org, method, account); branch overrides per (org, branch, method,
    // account). Postgres treats NULLs as distinct, so a single index would not
    // constrain org-wide rows.
    await qr.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_branch_method_account"`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_method_account" ON "payment_accounts" ("organization_id", "payment_method", "account_id") WHERE "branch_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_branch_method_account" ON "payment_accounts" ("organization_id", "branch_id", "payment_method", "account_id") WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_method_account"`,
    );
    await qr.query(
      `DROP INDEX IF EXISTS "uniq_payment_accounts_org_branch_method_account"`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX "uniq_payment_accounts_org_branch_method_account" ON "payment_accounts" ("organization_id", "branch_id", "payment_method", "account_id") WHERE "deleted_at" IS NULL`,
    );
    // The org-wide collapse is data and is not reversed; re-imposing NOT NULL would
    // require deleting the org-wide rows, so branch_id is left nullable.
  }
}
