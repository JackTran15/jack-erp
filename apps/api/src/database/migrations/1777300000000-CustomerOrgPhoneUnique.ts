import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerOrgPhoneUnique1777300000000 implements MigrationInterface {
  name = 'CustomerOrgPhoneUnique1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_customer_org_phone"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_customer_org_phone"
      ON "customers" ("organization_id", "phone")
      WHERE "phone" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."uq_customer_org_phone"`);
    await queryRunner.query(`
      CREATE INDEX "idx_customer_org_phone" ON "customers" ("organization_id", "phone")
    `);
  }
}
