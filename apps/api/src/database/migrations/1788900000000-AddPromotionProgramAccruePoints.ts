import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `accrue_points` to `promotion_programs` — whether an invoice-discount program
 * lets the invoice it applies to earn loyalty points.
 *
 * The column DEFAULT stays false so programs created after this migration ships
 * default to points-off (the "new programs default to no points" business rule).
 * Existing rows are backfilled to true in the same migration so already-live
 * programs keep accruing points exactly as they do today — confirmed by Akenzy
 * via AI-DLC discovery Q&A, 2026-08-17, see 03-logical-design.md's "Migration
 * impact" note.
 */
export class AddPromotionProgramAccruePoints1788900000000
  implements MigrationInterface
{
  name = 'AddPromotionProgramAccruePoints1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "promotion_programs"
      ADD COLUMN IF NOT EXISTS "accrue_points" boolean NOT NULL DEFAULT false
    `);
    // Backfill: rows that existed before this migration keep today's behavior (points
    // accrue) until an admin explicitly opts one out via the new checkbox. The column
    // DEFAULT stays false so programs created AFTER this migration default to
    // points-off, per the "new programs default to no points" business rule.
    // Confirmed by Akenzy, 2026-08-17 — see 03-logical-design.md "Migration impact".
    await queryRunner.query(`
      UPDATE "promotion_programs" SET "accrue_points" = true
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "promotion_programs"."accrue_points" IS
        'Whether this promotion program allows the invoice it applies to earn loyalty points. Default false for programs created after 2026-08-17; existing programs were backfilled to true to preserve their pre-existing points behavior. Only meaningful for INVOICE_DISCOUNT-type programs today.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "promotion_programs" DROP COLUMN IF EXISTS "accrue_points"
    `);
  }
}
