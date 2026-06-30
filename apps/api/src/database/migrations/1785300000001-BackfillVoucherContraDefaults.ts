import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill org-wide default contra accounts so existing organizations can post
 * manual cash receipt/payment vouchers (which now resolve their contra account
 * from the voucher purpose). New orgs get these via DefaultAccountSeederService
 * at registration; this covers orgs created before that seeder existed.
 *
 * Insert-if-missing per (org, role): one org-wide row (branch_id NULL) per role,
 * mapping to the org's COA account with the matching code. Orgs lacking a code
 * are simply skipped (the JOIN yields no row).
 *
 * Runs in its own transaction (migrationsTransactionMode: 'each') AFTER
 * 1785300000000 commits, so the new enum values are usable here.
 */
export class BackfillVoucherContraDefaults1785300000001
  implements MigrationInterface
{
  name = 'BackfillVoucherContraDefaults1785300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH role_code (role, code) AS (
        VALUES
          ('REVENUE', '511'),
          ('RECEIVABLE', '131'),
          ('OTHER_INCOME', '711'),
          ('PAYABLE', '331'),
          ('EXPENSE', '642')
      )
      INSERT INTO "accounting_default_account"
        ("id", "organization_id", "branch_id", "account_role", "account_id",
         "created_by", "created_at", "updated_at")
      SELECT
        gen_random_uuid(),
        a."organization_id",
        NULL,
        rc.role::"accounting_default_account_role_enum",
        a."id",
        'migration:1785300000001',
        NOW(),
        NOW()
      FROM role_code rc
      JOIN "accounts" a ON a."code" = rc.code
      WHERE NOT EXISTS (
        SELECT 1 FROM "accounting_default_account" d
        WHERE d."organization_id" = a."organization_id"
          AND d."account_role" = rc.role::"accounting_default_account_role_enum"
          AND d."branch_id" IS NULL
          AND d."deleted_at" IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "accounting_default_account" WHERE "created_by" = 'migration:1785300000001'`,
    );
  }
}
