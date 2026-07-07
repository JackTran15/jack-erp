import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a nullable `code` column to branches (store code, printed on barcode
 * labels) with a partial unique index so the code is unique per organization
 * while allowing many branches without a code.
 */
export class AddBranchCode1786200000000 implements MigrationInterface {
  name = 'AddBranchCode1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "branches"
      ADD COLUMN IF NOT EXISTS "code" character varying
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_branches_org_code"
      ON "branches" ("organization_id", "code")
      WHERE "code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_branches_org_code"`);
    await queryRunner.query(`ALTER TABLE "branches" DROP COLUMN IF EXISTS "code"`);
  }
}
