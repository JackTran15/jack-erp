import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce exactly one cash fund per branch (one-fund-per-branch model). Fails
 * fast if any branch still has more than one cash_account so the duplicates are
 * deduplicated before the constraint lands. `cash_accounts` has no soft-delete,
 * so a plain partial unique index is sufficient.
 */
export class UniqueCashAccountPerBranch1781400000002
  implements MigrationInterface
{
  name = 'UniqueCashAccountPerBranch1781400000002';

  public async up(qr: QueryRunner): Promise<void> {
    const dups: Array<{ organization_id: string; branch_id: string }> =
      await qr.query(`
        SELECT organization_id, branch_id
        FROM cash_accounts
        WHERE branch_id IS NOT NULL
        GROUP BY organization_id, branch_id
        HAVING COUNT(*) > 1
      `);
    if (dups.length > 0) {
      throw new Error(
        `Cannot create unique cash-fund index: ${dups.length} branch(es) have more than one cash_account. ` +
          `Deduplicate (merge funds) before running this migration.`,
      );
    }

    await qr.query(`
      CREATE UNIQUE INDEX "uniq_cash_account_org_branch"
      ON "cash_accounts" ("organization_id", "branch_id")
      WHERE "branch_id" IS NOT NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "uniq_cash_account_org_branch"`);
  }
}
