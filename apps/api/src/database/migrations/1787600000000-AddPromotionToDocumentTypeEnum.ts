import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add 'PROMOTION' to the document_number_rules document-type enum.
 *
 * Kept in its own transaction (migrationsTransactionMode: 'each') — a later
 * migration in this same batch inserts rows/queries using this new value,
 * and Postgres forbids using a freshly added enum value within the same
 * transaction that added it (55P04).
 */
export class AddPromotionToDocumentTypeEnum1787600000000
  implements MigrationInterface
{
  name = 'AddPromotionToDocumentTypeEnum1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'PROMOTION'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op — see header comment.
  }
}
