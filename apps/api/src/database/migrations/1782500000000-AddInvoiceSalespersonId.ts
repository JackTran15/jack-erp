import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a nullable `salesperson_id` FK on `invoices` linking the sale to the
 * employee (EmployeeProfileEntity / `employee_profiles`) credited with it —
 * distinct from `staff_id` (the user who created the invoice). ON DELETE SET
 * NULL so removing an employee profile doesn't block invoice history. Existing
 * invoices get `salesperson_id = NULL`.
 */
export class AddInvoiceSalespersonId1782500000000
  implements MigrationInterface
{
  name = 'AddInvoiceSalespersonId1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "salesperson_id" uuid`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "invoices"
          ADD CONSTRAINT "FK_invoices_salesperson"
          FOREIGN KEY ("salesperson_id") REFERENCES "employee_profiles"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invoices_salesperson" ON "invoices" ("salesperson_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_invoices_salesperson"`);
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "FK_invoices_salesperson";
      EXCEPTION WHEN others THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "salesperson_id"`,
    );
  }
}
