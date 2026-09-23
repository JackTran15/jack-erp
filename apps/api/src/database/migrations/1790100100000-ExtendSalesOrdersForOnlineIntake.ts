import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nới `sales_orders` để chứa đơn web (feature
 * 2026092001-online-order-intake-dispatch, ADR-01).
 *
 * KHÔNG dựng bảng đơn thứ hai (ADR-01): một đơn web và một đơn tư vấn viên đi
 * qua cùng một vòng đời `SENT → PROCESSED/REJECTED/CANCELLED`, nên tách bảng là
 * nhân đôi mọi query điều phối, báo cáo và số chứng từ.
 *
 * Ba nhóm thay đổi:
 *
 * 1. `salesperson_id` / `salesperson_name` NOT NULL → nullable (A-04). Đơn web
 *    không có tư vấn viên. Phương án còn lại là một "nhân viên hệ thống" giả,
 *    và nó sẽ chảy thẳng vào `invoices.salesperson_id` làm bẩn báo cáo hoa hồng.
 *
 * 2. Địa chỉ giao là SNAPSHOT, không FK sang `geo_*` (A-07, ADR-05, AC-03).
 *    `geo_wards` mang sẵn `merged_from` cho đợt sáp nhập địa giới — một FK cứng
 *    sẽ vỡ khi dataset đổi, và tên đọc-lại-theo-dataset sẽ làm chứng từ cũ tự
 *    đổi nội dung. Vì vậy cả MÃ lẫn TÊN đều chốt xuống đơn. Độ dài cột theo
 *    đúng `geo_provinces.code` (16), `geo_wards.code` (8), `name` (100) để lưu
 *    được mọi mã hiện có mà không cần đọc bảng gốc.
 *
 * 3. `UNIQUE (organization_id, sales_channel_id, external_order_id)` là index
 *    RIÊNG PHẦN `WHERE external_order_id IS NOT NULL`. Đơn mobile không có id
 *    ngoài; nếu ràng buộc phủ cả NULL thì mọi đơn mobile sẽ đụng nhau.
 *
 * Đơn mobile đang có: `sales_channel_id` NULL, mọi cột mới NULL/0 — không
 * backfill. `branch_id` KHÔNG đổi, nó đã nullable từ `1789950000000`.
 */
export class ExtendSalesOrdersForOnlineIntake1790100100000
  implements MigrationInterface
{
  name = 'ExtendSalesOrdersForOnlineIntake1790100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ALTER COLUMN "salesperson_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ALTER COLUMN "salesperson_name" DROP NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "sales_orders"
        ADD COLUMN "sales_channel_id"   uuid,
        ADD COLUMN "external_order_id"  character varying,
        ADD COLUMN "shipping_fee"       numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN "recipient_name"     character varying,
        ADD COLUMN "recipient_phone"    character varying,
        ADD COLUMN "ship_province_code" character varying(16),
        ADD COLUMN "ship_province_name" character varying(100),
        ADD COLUMN "ship_ward_code"     character varying(8),
        ADD COLUMN "ship_ward_name"     character varying(100),
        ADD COLUMN "ship_address_line"  character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_orders"
        ADD CONSTRAINT "FK_sales_orders_sales_channel"
        FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels" ("id")
        ON DELETE RESTRICT
    `);

    // Riêng phần: chỉ ràng buộc những đơn THỰC SỰ có id ngoài.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_sales_orders_org_channel_external"
        ON "sales_orders" ("organization_id", "sales_channel_id", "external_order_id")
        WHERE "external_order_id" IS NOT NULL
    `);

    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."sales_channel_id" IS 'Kênh bán đã khai báo; NULL với đơn tư vấn viên trên mobile'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."external_order_id" IS 'Mã đơn phía website — khoá chống tạo trùng khi web gọi lại'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."ship_ward_name" IS 'Tên phường CHỐT lúc đặt; cố tình không đọc lại từ geo_wards (AC-03)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."ship_province_name" IS 'Tên tỉnh CHỐT lúc đặt; cố tình không đọc lại từ geo_provinces (AC-03)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_sales_orders_org_channel_external"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" DROP CONSTRAINT IF EXISTS "FK_sales_orders_sales_channel"`,
    );
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
        DROP COLUMN "ship_address_line",
        DROP COLUMN "ship_ward_name",
        DROP COLUMN "ship_ward_code",
        DROP COLUMN "ship_province_name",
        DROP COLUMN "ship_province_code",
        DROP COLUMN "recipient_phone",
        DROP COLUMN "recipient_name",
        DROP COLUMN "shipping_fee",
        DROP COLUMN "external_order_id",
        DROP COLUMN "sales_channel_id"
    `);

    // Chỉ khôi phục được NOT NULL khi không còn đơn nào thiếu tư vấn viên —
    // tức là khi chưa có đơn web nào. Revert sau khi đã nhận đơn web sẽ dừng ở
    // đây, có chủ đích: im lặng xoá đơn để revert chạy được là mất dữ liệu.
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ALTER COLUMN "salesperson_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ALTER COLUMN "salesperson_id" SET NOT NULL`,
    );
  }
}
