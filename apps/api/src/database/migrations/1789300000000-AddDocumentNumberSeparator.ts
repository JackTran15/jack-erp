import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `formatDocumentNumber` joined the prefix / date / sequence / suffix segments
 * with a hardcoded `-`, so a rule could never render a run-together number like
 * `2608210001`. The separator becomes rule data instead of a constant.
 *
 * `DEFAULT '-'` is what keeps this migration invisible: every one of the
 * existing rules picks up the character the code used to hardcode, so their
 * numbers render byte-for-byte as before.
 */
export class AddDocumentNumberSeparator1789300000000
  implements MigrationInterface
{
  name = 'AddDocumentNumberSeparator1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_number_rules"
      ADD COLUMN IF NOT EXISTS "separator" varchar(5) NOT NULL DEFAULT '-'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "document_number_rules"."separator" IS
        'String joining prefix / date / sequence / suffix; empty means no separator'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_number_rules" DROP COLUMN IF EXISTS "separator"
    `);
  }
}
