import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a nullable `code` column to customer_groups (Mã nhóm khách hàng, used
 * as the lookup key for the customer Excel import CustomerCategoryCode
 * column) with a partial unique index so the code is unique per organization
 * while allowing existing groups without a code until the backfill runs.
 */
export class AddCustomerGroupCode1786300000002 implements MigrationInterface {
  name = 'AddCustomerGroupCode1786300000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_groups"
      ADD COLUMN IF NOT EXISTS "code" character varying(50)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_group_org_code"
      ON "customer_groups" ("organization_id", "code")
      WHERE "code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_customer_group_org_code"`);
    await queryRunner.query(
      `ALTER TABLE "customer_groups" DROP COLUMN IF EXISTS "code"`,
    );
  }
}
