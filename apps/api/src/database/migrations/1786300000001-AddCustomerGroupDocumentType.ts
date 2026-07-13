import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the CUSTOMER_GROUP (NKH) document type so DocumentNumberingService can
 * issue customer group codes ("NKHxxxxxx"). Postgres enum values are
 * append-only and a new value cannot be used in the same transaction it is
 * added in, so this lives in its own migration ahead of the backfill that
 * consumes it. `down` is a no-op.
 */
export class AddCustomerGroupDocumentType1786300000001
  implements MigrationInterface
{
  name = 'AddCustomerGroupDocumentType1786300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'CUSTOMER_GROUP'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support dropping an enum value — intentional no-op.
  }
}
