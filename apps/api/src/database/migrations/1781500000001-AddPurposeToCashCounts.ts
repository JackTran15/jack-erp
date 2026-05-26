import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the "purpose" (Mục đích) free-text column to cash_counts. The per-line
 * denomination "description" (Diễn giải) lives inside the existing
 * `denominations` jsonb column, so no schema change is needed for it.
 */
export class AddPurposeToCashCounts1781500000001
  implements MigrationInterface
{
  name = 'AddPurposeToCashCounts1781500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_counts" ADD COLUMN IF NOT EXISTS "purpose" text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_counts" DROP COLUMN IF EXISTS "purpose"`,
    );
  }
}
