import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashAccountType1779500000000 implements MigrationInterface {
  name = 'AddCashAccountType1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "cash_accounts_type_enum" AS ENUM ('REGISTER', 'SAFE', 'PETTY_CASH')
    `);
    await queryRunner.query(`
      ALTER TABLE "cash_accounts"
      ADD COLUMN "type" "cash_accounts_type_enum" NOT NULL DEFAULT 'REGISTER'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "cash_accounts"."type" IS 'REGISTER=két quầy POS, SAFE=két chính chi nhánh, PETTY_CASH=quỹ lẻ'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cash_accounts" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_accounts_type_enum"`);
  }
}
