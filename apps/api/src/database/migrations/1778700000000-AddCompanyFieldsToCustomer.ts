import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyFieldsToCustomer1778700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS company_name VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS tax_code VARCHAR(20) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
        DROP COLUMN IF EXISTS company_name,
        DROP COLUMN IF EXISTS tax_code
    `);
  }
}
