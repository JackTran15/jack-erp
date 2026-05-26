import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-fund-per-branch model: ensure every branch has a cash fund (a cash_accounts
 * row mapped to COA "1111"). Idempotent — only branches without a fund get one;
 * branches in orgs that lack COA 1111 are skipped (run the COA backfill first).
 */
export class BackfillBranchCashFunds1781400000000 implements MigrationInterface {
  name = 'BackfillBranchCashFunds1781400000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      INSERT INTO cash_accounts
        (organization_id, branch_id, name, type, balance, account_id, created_by)
      SELECT b.organization_id,
             b.id::text,
             'Quỹ tiền mặt - ' || b.name,
             'REGISTER'::cash_accounts_type_enum,
             0,
             a.id,
             b.created_by
      FROM branches b
      JOIN accounts a
        ON a.organization_id = b.organization_id
       AND a.code = '1111'
       AND a.is_active = true
      WHERE NOT EXISTS (
        SELECT 1 FROM cash_accounts ca
        WHERE ca.organization_id = b.organization_id
          AND ca.branch_id = b.id::text
      )
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: data backfill. Manual cleanup if needed.
  }
}
