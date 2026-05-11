import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashAccountToPosSession1779520000000 implements MigrationInterface {
  name = 'AddCashAccountToPosSession1779520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_sessions" ADD COLUMN "cash_account_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "pos_sessions"
      ADD CONSTRAINT "fk_pos_sessions_cash_account"
      FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id")
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "pos_sessions"."cash_account_id" IS 'Cash register/drawer used in this session'
    `);

    // Best-effort backfill: pick the first REGISTER cash_account per branch.
    await queryRunner.query(`
      UPDATE "pos_sessions" ps
      SET "cash_account_id" = sub.id
      FROM (
        SELECT DISTINCT ON (branch_id) id, branch_id
        FROM "cash_accounts"
        WHERE type = 'REGISTER'
        ORDER BY branch_id, created_at ASC
      ) sub
      WHERE ps.branch_id = sub.branch_id AND ps."cash_account_id" IS NULL
    `);

    // Partial unique index — only one active (OPEN or ACTIVE_SALES) session per cash_account at a time.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_pos_session_active_per_cash_account"
      ON "pos_sessions" ("cash_account_id")
      WHERE "status" IN ('OPEN', 'ACTIVE_SALES') AND "cash_account_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pos_session_active_per_cash_account"`);
    await queryRunner.query(`
      ALTER TABLE "pos_sessions" DROP CONSTRAINT IF EXISTS "fk_pos_sessions_cash_account"
    `);
    await queryRunner.query(`ALTER TABLE "pos_sessions" DROP COLUMN IF EXISTS "cash_account_id"`);
  }
}
