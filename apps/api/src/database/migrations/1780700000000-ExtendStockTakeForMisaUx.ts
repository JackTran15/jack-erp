import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extend stock_takes / stock_take_lines for the MISA-style UX:
 *  - purpose, planned_date, counted_at, conclusion on the header
 *  - reason on each line
 *  - generated_receipt_id / generated_issue_id back-references to documents
 *    produced by the "Xử lý" (process) action
 *  - STOCK_TAKE added to the document_number_rules enum so number generation
 *    can hand out "KK000001" etc.
 */
export class ExtendStockTakeForMisaUx1780700000000
  implements MigrationInterface
{
  name = 'ExtendStockTakeForMisaUx1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "purpose" text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "planned_date" date NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "counted_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "conclusion" text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "generated_receipt_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "generated_issue_id" uuid NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "stock_take_lines" ADD COLUMN IF NOT EXISTS "reason" text NULL`,
    );

    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'STOCK_TAKE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_take_lines" DROP COLUMN IF EXISTS "reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "generated_issue_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "generated_receipt_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "conclusion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "counted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "planned_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "purpose"`,
    );
    // The enum value cannot be safely removed without potentially breaking
    // existing rows; mirror the no-op approach used by sibling migrations.
  }
}
