import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `api_keys.sales_channel_id` — nối một API key với kênh bán nó đại diện
 * (feature 2026092001-online-order-intake-dispatch, T-01-06).
 *
 * Trước migration này không có gì nối key với kênh: `sales_orders.sales_channel_id`
 * (1790100100000) không có nguồn, nên khoá chống trùng
 * `UNIQUE (organization_id, sales_channel_id, external_order_id)` suy biến và
 * `CHANNEL_INACTIVE` không có gì để kiểm.
 *
 * **NULL là hợp lệ và là mặc định**: key nội bộ / key tích hợp không phải kênh
 * bán nào cả. Mọi key đang tồn tại nhận NULL và xác thực y như cũ — chỉ đường
 * partner mới đòi cột này khác NULL.
 *
 * `ON DELETE RESTRICT` cùng khuôn với FK của `sales_orders`: xoá cứng một kênh
 * đang có key trỏ tới sẽ bị chặn (xoá kênh vốn là SOFT delete).
 */
export class AddApiKeySalesChannel1790100400000 implements MigrationInterface {
  name = 'AddApiKeySalesChannel1790100400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD COLUMN "sales_channel_id" uuid`,
    );

    await queryRunner.query(`
      ALTER TABLE "api_keys"
        ADD CONSTRAINT "FK_api_keys_sales_channel"
        FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels" ("id")
        ON DELETE RESTRICT
    `);

    await queryRunner.query(
      `COMMENT ON COLUMN "api_keys"."sales_channel_id" IS 'Kênh bán mà key này đại diện; NULL = key không thuộc kênh nào (nội bộ/tích hợp khác)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "FK_api_keys_sales_channel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "sales_channel_id"`,
    );
  }
}
