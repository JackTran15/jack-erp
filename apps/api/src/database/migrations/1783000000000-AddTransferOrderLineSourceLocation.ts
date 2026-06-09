import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a per-line source bin to transfer_order_lines. Resolved from stock (the
 * bin holding the item in the source storage) when the transfer order is
 * created, so the locked goods-issue form spawned from the order can display +
 * submit the Vị trí. Nullable, no FK: legacy rows stay null and fall back to
 * live stock resolution at read time.
 */
export class AddTransferOrderLineSourceLocation1783000000000
  implements MigrationInterface
{
  name = 'AddTransferOrderLineSourceLocation1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" ADD COLUMN "source_location_id" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" DROP COLUMN IF EXISTS "source_location_id"`,
    );
  }
}
