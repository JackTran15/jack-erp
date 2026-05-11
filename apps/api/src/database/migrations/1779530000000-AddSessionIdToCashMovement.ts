import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionIdToCashMovement1779530000000 implements MigrationInterface {
  name = 'AddSessionIdToCashMovement1779530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cash_movements" ADD COLUMN "session_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "cash_movements"
      ADD CONSTRAINT "fk_cash_movements_session"
      FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cash_movement_session" ON "cash_movements" ("session_id")
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "cash_movements"."session_id" IS 'POS session that recorded this movement, if any'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_movement_session"`);
    await queryRunner.query(`
      ALTER TABLE "cash_movements" DROP CONSTRAINT IF EXISTS "fk_cash_movements_session"
    `);
    await queryRunner.query(`ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "session_id"`);
  }
}
