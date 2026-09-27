import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_LABELS_VI } from '@erp/shared-interfaces';

const CONFIRM_SHAPE_CHECK = `
  ("action" = 'DISPATCH' AND "to_branch_id" IS NOT NULL)
  OR
  ("action" = 'RETURN'
    AND "to_branch_id" IS NULL
    AND "from_branch_id" IS NOT NULL
    AND "reason" IS NOT NULL)
  OR
  ("action" = 'CONFIRM'
    AND "from_branch_id" IS NULL
    AND "to_branch_id" IS NULL)
`;

const DELIVERY_SHAPE_CHECK = `
  ("action" = 'DISPATCH' AND "to_branch_id" IS NOT NULL)
  OR
  ("action" = 'RETURN'
    AND "to_branch_id" IS NULL
    AND "from_branch_id" IS NOT NULL
    AND "reason" IS NOT NULL)
  OR
  ("action" IN ('CONFIRM', 'PROCESS', 'DELIVER', 'DELIVERY_STATUS')
    AND "from_branch_id" IS NULL
    AND "to_branch_id" IS NULL)
`;

const NEW_ACTIONS = ['PROCESS', 'DELIVER', 'DELIVERY_STATUS'];

const DELIVER_PERMISSION = 'pos.sales-order.deliver';

/**
 * Vòng đời giao hàng của đơn (feature 2026092402-pos-order-delivery-lifecycle,
 * T-02-01, ADR-01/02/06).
 *
 * - `sales_order_delivery_status_enum` + 7 cột giao trên `sales_orders`
 *   (ADR-01): trục thứ hai, nullable, đứng cạnh `status`. NULL = chưa vào vòng
 *   đời giao. `partner_shipping_fee` NULL, KHÔNG default — NULL là "chưa biết",
 *   khác 0.
 * - `delivery_partners` (ADR-02): danh mục org-scoped, soft delete, cùng khuôn
 *   cột với `sales_channels`. Mã duy nhất theo tổ chức CHỈ giữa các đối tác
 *   chưa xoá (index riêng phần), khác `sales_channels` (UNIQUE phủ cả dòng đã
 *   xoá).
 * - `sales_order_dispatch_action_enum` thêm `PROCESS`, `DELIVER`,
 *   `DELIVERY_STATUS` (ADR-06), và `CHK_sales_order_dispatch_events_shape` mở
 *   cho ba action đó với hình dạng của `CONFIRM` (hai cột chi nhánh NULL) —
 *   thiếu bước này thì dòng vết đầu tiên của ba action mới bị CHECK chặn.
 * - Quyền `pos.sales-order.deliver`, CẤP cho mọi role đang giữ
 *   `pos.sales-order.approve` (khuôn `1789960000000`): `PermissionSyncService`
 *   chỉ ghi bảng `permissions`, không cấp role.
 * - Backfill: đơn `PROCESSED` có hoá đơn chưa huỷ → `AWAITING_PICKUP`, để
 *   chúng hiện trên lưới Đơn hàng thay vì biến mất. Đơn có hoá đơn đã huỷ (hoặc
 *   không còn hoá đơn) giữ NULL.
 *
 * `transaction = false`, CỐ Ý — cùng lý do với `1790100600000`: Postgres không
 * cho dùng giá trị enum vừa `ADD VALUE` trong cùng transaction, mà CHECK mới
 * nhắc tới chúng. `ADD VALUE` chạy riêng (tự commit, `IF NOT EXISTS` để chạy
 * lại được), phần còn lại tự bọc trong một transaction.
 *
 * `down()`: Postgres không có `DROP VALUE`, nên ba giá trị enum mới ĐỂ LẠI —
 * vô hại khi không còn dòng nào dùng (rollback của UOW-02). Các dòng vết
 * `PROCESS`/`DELIVER`/`DELIVERY_STATUS` bị XOÁ trước để dựng lại CHECK cũ —
 * bảng vết append-only, nên revert là mất vết xử lý/giao. Cột giao, bảng đối
 * tác và quyền bị gỡ hẳn.
 *
 * Tên INDEX / CONSTRAINT phải khớp `@Index` trên `SalesOrderEntity` và
 * `DeliveryPartnerEntity`, nếu không `migration:generate` lần sau sinh diff giả.
 */
export class AddSalesOrderDelivery1790100700000 implements MigrationInterface {
  name = 'AddSalesOrderDelivery1790100700000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const action of NEW_ACTIONS) {
      await queryRunner.query(
        `ALTER TYPE "sales_order_dispatch_action_enum" ADD VALUE IF NOT EXISTS '${action}'`,
      );
    }

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`
        CREATE TABLE "delivery_partners" (
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
          CONSTRAINT "PK_delivery_partners" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_delivery_partners_org_code"
          ON "delivery_partners" ("organization_id", "code")
          WHERE "deleted_at" IS NULL
      `);
      await queryRunner.query(
        `COMMENT ON COLUMN "delivery_partners"."code" IS 'Mã đối tác, duy nhất theo tổ chức trong các đối tác chưa xoá — GHN, GHTK, VTP…'`,
      );
      await queryRunner.query(
        `COMMENT ON COLUMN "delivery_partners"."name" IS 'Tên hiển thị; chuỗi này được snapshot xuống đơn lúc giao'`,
      );
      await queryRunner.query(
        `COMMENT ON COLUMN "delivery_partners"."is_active" IS 'Đối tác ngừng hoạt động không chọn được khi giao; đơn cũ giữ nguyên'`,
      );

      await queryRunner.query(`
        CREATE TYPE "sales_order_delivery_status_enum" AS ENUM (
          'AWAITING_PICKUP', 'IN_TRANSIT', 'AWAITING_COD', 'COMPLETED', 'FAILED', 'RETURNED'
        )
      `);
      await queryRunner.query(`
        ALTER TABLE "sales_orders"
          ADD COLUMN "delivery_status"       "sales_order_delivery_status_enum",
          ADD COLUMN "delivered_at"          TIMESTAMP WITH TIME ZONE,
          ADD COLUMN "delivery_partner_id"   uuid,
          ADD COLUMN "delivery_partner_name" character varying(200),
          ADD COLUMN "tracking_code"         character varying(100),
          ADD COLUMN "partner_shipping_fee"  numeric(18,2),
          ADD COLUMN "package_info"          character varying(500)
      `);
      await queryRunner.query(`
        ALTER TABLE "sales_orders"
          ADD CONSTRAINT "FK_sales_orders_delivery_partner"
          FOREIGN KEY ("delivery_partner_id") REFERENCES "delivery_partners" ("id")
          ON DELETE RESTRICT
      `);
      await queryRunner.query(`
        CREATE INDEX "IDX_sales_orders_org_branch_delivery_status"
          ON "sales_orders" ("organization_id", "branch_id", "delivery_status")
      `);

      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" DROP CONSTRAINT "CHK_sales_order_dispatch_events_shape"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" ADD CONSTRAINT "CHK_sales_order_dispatch_events_shape" CHECK (${DELIVERY_SHAPE_CHECK})`,
      );

      await queryRunner.query(
        `INSERT INTO permissions (key, description, module) VALUES ($1, $2, 'pos') ON CONFLICT (key) DO NOTHING`,
        [DELIVER_PERMISSION, PERMISSION_LABELS_VI[DELIVER_PERMISSION] ?? DELIVER_PERMISSION],
      );
      // Ai nhận xử lý được (thu ngân, quản lý) thì giao được.
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT rp.role_id, target.id
           FROM role_permissions rp
           JOIN permissions held ON held.id = rp.permission_id AND held.key = $1
           JOIN permissions target ON target.key = $2
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        ['pos.sales-order.approve', DELIVER_PERMISSION],
      );

      await queryRunner.query(`
        UPDATE "sales_orders" so
           SET "delivery_status" = 'AWAITING_PICKUP'
          FROM "invoices" i
         WHERE i."id" = so."invoice_id"
           AND so."status" = 'PROCESSED'
           AND so."delivery_status" IS NULL
           AND i."status" <> 'cancelled'
      `);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `DELETE FROM "sales_order_dispatch_events" WHERE "action"::text = ANY($1::text[])`,
        [NEW_ACTIONS],
      );
      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" DROP CONSTRAINT "CHK_sales_order_dispatch_events_shape"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" ADD CONSTRAINT "CHK_sales_order_dispatch_events_shape" CHECK (${CONFIRM_SHAPE_CHECK})`,
      );

      await queryRunner.query(
        `DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = $1)`,
        [DELIVER_PERMISSION],
      );
      await queryRunner.query(`DELETE FROM permissions WHERE key = $1`, [DELIVER_PERMISSION]);

      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_sales_orders_org_branch_delivery_status"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_orders" DROP CONSTRAINT IF EXISTS "FK_sales_orders_delivery_partner"`,
      );
      await queryRunner.query(`
        ALTER TABLE "sales_orders"
          DROP COLUMN "package_info",
          DROP COLUMN "partner_shipping_fee",
          DROP COLUMN "tracking_code",
          DROP COLUMN "delivery_partner_name",
          DROP COLUMN "delivery_partner_id",
          DROP COLUMN "delivered_at",
          DROP COLUMN "delivery_status"
      `);
      await queryRunner.query(`DROP TYPE IF EXISTS "sales_order_delivery_status_enum"`);

      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_delivery_partners_org_code"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "delivery_partners"`);

      // Giá trị PROCESS / DELIVER / DELIVERY_STATUS của
      // `sales_order_dispatch_action_enum` ĐỂ LẠI: Postgres không có DROP VALUE.
      // Vô hại — không còn dòng nào dùng, và `up()` thêm lại bằng IF NOT EXISTS.

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}
