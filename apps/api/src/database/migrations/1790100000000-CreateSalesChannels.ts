import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sales_channels` — kênh bán đăng ký được (feature
 * 2026092001-online-order-intake-dispatch, ADR-03).
 *
 * Org-scoped, soft-delete. Lý do bảng tồn tại: mở Shopee/TikTok/Lazada về sau
 * phải là thêm một DÒNG DỮ LIỆU, không phải một migration enum.
 *
 * Tên UNIQUE phải khớp `@Unique('uq_sales_channels_org_code', …)` trên entity,
 * nếu không `migration:generate` lần sau sẽ sinh ra một diff giả.
 */
export class CreateSalesChannels1790100000000 implements MigrationInterface {
  name = 'CreateSalesChannels1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sales_channels" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id"       character varying,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      character varying NOT NULL,
        "code"            character varying(32) NOT NULL,
        "name"            character varying(200) NOT NULL,
        "is_active"       boolean NOT NULL DEFAULT true,
        "deleted_at"      TIMESTAMP,
        CONSTRAINT "PK_sales_channels" PRIMARY KEY ("id"),
        CONSTRAINT "uq_sales_channels_org_code" UNIQUE ("organization_id", "code")
      )
    `);

    await queryRunner.query(
      `COMMENT ON COLUMN "sales_channels"."code" IS 'Mã kênh, duy nhất theo tổ chức — WEB, SHOPEE, TIKTOK…'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_channels"."name" IS 'Tên hiển thị; chính chuỗi này được snapshot xuống đơn và hoá đơn'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_channels"."is_active" IS 'Kênh ngừng hoạt động không nhận đơn mới; đơn cũ giữ nguyên'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_channels"`);
  }
}
