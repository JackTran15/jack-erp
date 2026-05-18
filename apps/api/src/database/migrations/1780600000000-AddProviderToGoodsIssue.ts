import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add provider_id to goods_issues so the UI's "Đối tượng" (nhà cung cấp / đối
 * tác) pick is actually persisted. Previously the FE picked a provider but
 * never sent it to the BE, so the list column rendered empty for everything
 * except TRANSFER_OUT (which derived from target_branch_id).
 */
export class AddProviderToGoodsIssue1780600000000 implements MigrationInterface {
  name = 'AddProviderToGoodsIssue1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issues" ADD COLUMN IF NOT EXISTS "provider_id" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_issues_provider_id" ON "goods_issues" ("provider_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_goods_issues_provider_id"`);
    await queryRunner.query(`ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "provider_id"`);
  }
}
