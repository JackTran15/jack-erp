import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeCustomerName1777400000000 implements MigrationInterface {
  name = 'MergeCustomerName1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "name" character varying
    `);
    await queryRunner.query(`
      UPDATE "customers"
      SET "name" = trim(concat_ws(' ', "last_name", "first_name"))
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "name" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN "first_name",
      DROP COLUMN "last_name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "first_name" character varying,
      ADD COLUMN "last_name" character varying
    `);
    await queryRunner.query(`
      UPDATE "customers"
      SET "last_name" = "name",
          "first_name" = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "first_name" SET NOT NULL,
      ALTER COLUMN "last_name" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN "name"
    `);
  }
}
