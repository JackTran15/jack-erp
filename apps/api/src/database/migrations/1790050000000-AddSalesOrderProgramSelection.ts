import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores the consultant's promotion choice on the order (ADR-52, feature
 * 2026092101): which `auto_apply=false` programmes they turned on
 * (`selected_program_ids`) and which ones they removed (`excluded_program_ids`).
 * Without these the cashier cannot know what the consultant dropped, and the
 * saga re-applies every auto programme at checkout (A-88).
 *
 * `NOT NULL DEFAULT '[]'`: every existing order reads as "no choice made",
 * which is exactly what they were — the saga then runs the engine's defaults.
 */
export class AddSalesOrderProgramSelection1790050000000 implements MigrationInterface {
  name = 'AddSalesOrderProgramSelection1790050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "selected_program_ids" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "excluded_program_ids" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "excluded_program_ids"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "selected_program_ids"`);
  }
}
