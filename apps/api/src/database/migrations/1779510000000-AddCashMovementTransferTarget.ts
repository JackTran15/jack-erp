import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashMovementTransferTarget1779510000000 implements MigrationInterface {
  name = 'AddCashMovementTransferTarget1779510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cash_movements" ADD COLUMN "to_account_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "cash_movements"
      ADD CONSTRAINT "fk_cash_movements_to_account"
      FOREIGN KEY ("to_account_id") REFERENCES "cash_accounts"("id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cash_movement_to_account" ON "cash_movements" ("to_account_id")
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "cash_movements"."to_account_id" IS 'Destination cash account when type=TRANSFER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_movement_to_account"`);
    await queryRunner.query(`
      ALTER TABLE "cash_movements" DROP CONSTRAINT IF EXISTS "fk_cash_movements_to_account"
    `);
    await queryRunner.query(`ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "to_account_id"`);
  }
}
