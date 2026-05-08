import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeCustomerCodeRequired1778800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Fill null codes with a temporary unique value before adding NOT NULL constraint
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
        FROM customers
        WHERE code IS NULL
      )
      UPDATE customers
      SET code = 'KH' || LPAD(CAST(ranked.rn AS TEXT), 6, '0')
      FROM ranked
      WHERE customers.id = ranked.id
    `);

    // Drop the partial unique index (only when code IS NOT NULL)
    await queryRunner.query(`DROP INDEX IF EXISTS uq_customer_org_code`);

    // Make column NOT NULL and extend length to 50
    await queryRunner.query(`
      ALTER TABLE customers
        ALTER COLUMN code SET NOT NULL,
        ALTER COLUMN code TYPE VARCHAR(50)
    `);

    // Recreate as a full unique index (no WHERE condition)
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_customer_org_code ON customers (organization_id, code)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_customer_org_code`);

    await queryRunner.query(`
      ALTER TABLE customers
        ALTER COLUMN code DROP NOT NULL,
        ALTER COLUMN code TYPE VARCHAR(10)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_customer_org_code ON customers (organization_id, code)
      WHERE code IS NOT NULL
    `);
  }
}
