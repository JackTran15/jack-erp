import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sales_order_dispatch_events` — vết điều phối đơn hàng (feature
 * 2026092001-online-order-intake-dispatch, A-06, ADR-02, AC-12).
 *
 * Bảng riêng, KHÔNG phải `dispatched_by` / `dispatched_at` trên `sales_orders`:
 * cột chỉ giữ được lần phân gần nhất, nên một đơn bị trả về hai lần sẽ mất vết
 * lần đầu.
 *
 * APPEND-ONLY: không `updated_at`, không `deleted_at`. Đây là vết, không phải
 * bản ghi nghiệp vụ — ghi nhầm thì ghi thêm một dòng đính chính.
 *
 * `from_branch_id` / `to_branch_id` là `character varying` cho khớp
 * `sales_orders.branch_id` (chuỗi, không uuid) — so sánh uuid với varchar trong
 * mọi query join sau này là lỗi kiểu, không phải chuyện thẩm mỹ.
 *
 * `CHK_sales_order_dispatch_events_shape` ép đúng hai hình dạng hợp lệ, theo
 * đúng kiểu `CHK_cash_transfer_destination` đã có trong repo:
 * - `DISPATCH` phải có nơi đến; nơi đi NULL ở lần phân đầu.
 * - `RETURN` phải có nơi đi và LÝ DO, nơi đến NULL. Lý do là toàn bộ giá trị
 *   của dòng `RETURN`; một cú trả về không lý do thì lần sau Admin lại phân
 *   đúng chi nhánh đó.
 *
 * Tên INDEX / CONSTRAINT phải khớp `@Index` và `@Entity` trên
 * `SalesOrderDispatchEventEntity`, nếu không `migration:generate` lần sau sẽ
 * sinh diff giả.
 */
export class CreateSalesOrderDispatchEvents1790100200000
  implements MigrationInterface
{
  name = 'CreateSalesOrderDispatchEvents1790100200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "sales_order_dispatch_action_enum" AS ENUM ('DISPATCH', 'RETURN')`,
    );

    await queryRunner.query(`
      CREATE TABLE "sales_order_dispatch_events" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "sales_order_id"  uuid NOT NULL,
        "action"          "sales_order_dispatch_action_enum" NOT NULL,
        "from_branch_id"  character varying,
        "to_branch_id"    character varying,
        "actor_user_id"   uuid NOT NULL,
        "reason"          character varying,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_order_dispatch_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_order_dispatch_events_order"
          FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_sales_order_dispatch_events_shape" CHECK (
          ("action" = 'DISPATCH' AND "to_branch_id" IS NOT NULL)
          OR
          ("action" = 'RETURN'
            AND "to_branch_id" IS NULL
            AND "from_branch_id" IS NOT NULL
            AND "reason" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sales_order_dispatch_events_org_order_created"
        ON "sales_order_dispatch_events" ("organization_id", "sales_order_id", "created_at")
    `);

    await queryRunner.query(
      `COMMENT ON TABLE "sales_order_dispatch_events" IS 'Vết điều phối đơn hàng, APPEND-ONLY: không sửa, không xoá (A-06)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_order_dispatch_events"."from_branch_id" IS 'Chi nhánh giữ đơn TRƯỚC hành động; NULL ở lần phân đầu tiên'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_order_dispatch_events"."to_branch_id" IS 'Chi nhánh nhận đơn SAU hành động; NULL khi trả về pool'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_order_dispatch_events"."actor_user_id" IS 'users.id của người bấm — Admin khi DISPATCH, người của chi nhánh khi RETURN'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_order_dispatch_events"."reason" IS 'Bắt buộc với RETURN (ép bởi CHK_sales_order_dispatch_events_shape), tuỳ chọn với DISPATCH'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sales_order_dispatch_events_org_order_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "sales_order_dispatch_events"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "sales_order_dispatch_action_enum"`,
    );
  }
}
