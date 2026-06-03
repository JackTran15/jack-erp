import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the LOCATIONS value to the inventory_import_jobs_type_enum PostgreSQL enum. */
export class AddLocationsToImportJobType1782600000000 implements MigrationInterface {
  name = 'AddLocationsToImportJobType1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'LOCATIONS'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // Rollback is intentionally a no-op.
  }
}
