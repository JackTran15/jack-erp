import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the WAREHOUSE (WH) document type so DocumentNumberingService can issue
 * warehouse codes ("WHxxxxxx"). Postgres enum values are append-only and a new
 * value cannot be used in the same transaction it is added in, so this lives in
 * its own migration ahead of the backfill that consumes it. `down` is a no-op.
 */
export class AddWarehouseDocumentType1784800000000
  implements MigrationInterface
{
  name = 'AddWarehouseDocumentType1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'WAREHOUSE'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support dropping an enum value — intentional no-op.
  }
}
