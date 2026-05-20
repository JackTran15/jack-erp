import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add 'EMPLOYEE' to the document_number_rules document-type enum so the
 * numbering engine can generate continuous employee codes (e.g. NV000001).
 */
export class AddEmployeeToDocumentTypeEnum1780700000000
  implements MigrationInterface
{
  name = 'AddEmployeeToDocumentTypeEnum1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'EMPLOYEE'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support dropping an enum value — intentional no-op.
  }
}
