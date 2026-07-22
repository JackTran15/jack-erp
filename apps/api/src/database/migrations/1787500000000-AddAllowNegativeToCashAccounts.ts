import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `allow_negative` to cash_accounts, mirroring the flag deposit_accounts
 * already carries.
 *
 * Business decision: a cash fund IS allowed to go negative (the count in the
 * drawer and the recorded movements legitimately drift apart during the day), so
 * the column defaults to TRUE — the opposite of the deposit default — and both
 * existing and new rows start permissive. Setting it to FALSE re-enables the
 * insufficient-balance guard in CashService for that fund only.
 */
export class AddAllowNegativeToCashAccounts1787500000000
  implements MigrationInterface
{
  name = 'AddAllowNegativeToCashAccounts1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cash_accounts"
      ADD COLUMN IF NOT EXISTS "allow_negative" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_accounts" DROP COLUMN IF EXISTS "allow_negative"`,
    );
  }
}
