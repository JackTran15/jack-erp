import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotfix: the first cut of TemporaryTransfer1780000000000 created the
 * temporary_transfers tables but forgot to extend
 * `document_number_rules_document_type_enum` with the new `TEMPORARY_TRANSFER`
 * value, so DocumentNumberingService.generate() would crash at runtime with
 *   `invalid input value for enum ...: "TEMPORARY_TRANSFER"`.
 *
 * This migration adds the missing enum value. It is idempotent
 * (ADD VALUE IF NOT EXISTS) so it's safe both on fresh installs — where the
 * primary migration has since been patched to add the value — and on
 * databases that already ran the original (broken) migration.
 */
export class AddTemporaryTransferDocType1780000000001
  implements MigrationInterface
{
  name = 'AddTemporaryTransferDocType1780000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'TEMPORARY_TRANSFER'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL has no DROP VALUE for enum types. Leaving the value in place
    // is safe — no rows reference it unless a temporary transfer was created.
  }
}
