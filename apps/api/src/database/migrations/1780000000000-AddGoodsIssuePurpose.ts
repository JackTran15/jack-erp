import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoodsIssuePurpose1780000000000 implements MigrationInterface {
  name = 'AddGoodsIssuePurpose1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "goods_issue_purpose_enum" AS ENUM ('OTHER', 'SALE')
    `);
    await queryRunner.query(`
      ALTER TABLE "goods_issues"
        ADD COLUMN IF NOT EXISTS "purpose" "goods_issue_purpose_enum" NOT NULL DEFAULT 'OTHER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "purpose"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "goods_issue_purpose_enum"`);
  }
}
