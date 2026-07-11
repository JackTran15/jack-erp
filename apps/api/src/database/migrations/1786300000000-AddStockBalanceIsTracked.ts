import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `is_tracked` to stock_balances — per-(item, location) "đang theo dõi" flag
 * for the Chi tiết vị trí hàng hóa screen. This replaces the earlier, wrong
 * item-level "ngừng theo dõi" (which toggled item.is_active globally). All existing
 * balances are tracked by default; new balances default to tracked too.
 */
export class AddStockBalanceIsTracked1786300000000
  implements MigrationInterface
{
  name = 'AddStockBalanceIsTracked1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
      ADD COLUMN IF NOT EXISTS "is_tracked" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_balances" DROP COLUMN IF EXISTS "is_tracked"`,
    );
  }
}
