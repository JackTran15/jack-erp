import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `is_active` to storages — the "Ngừng hoạt động kho hàng" flag. A
 * deactivated warehouse is hidden from document pickers and excluded from the
 * stock summary (Tổng hợp tồn kho), but its ledger/report data is preserved.
 * Showroom (main storage) and the branch default-receiving warehouse cannot be
 * deactivated (enforced in the service). Existing storages default to active.
 */
export class AddStorageIsActive1786400000000 implements MigrationInterface {
  name = 'AddStorageIsActive1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "storages"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "storages" DROP COLUMN IF EXISTS "is_active"`,
    );
  }
}
