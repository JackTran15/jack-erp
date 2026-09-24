import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD_SHAPE_CHECK = `
  ("action" = 'DISPATCH' AND "to_branch_id" IS NOT NULL)
  OR
  ("action" = 'RETURN'
    AND "to_branch_id" IS NULL
    AND "from_branch_id" IS NOT NULL
    AND "reason" IS NOT NULL)
`;

const NEW_SHAPE_CHECK = `
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

/**
 * Duyệt đơn online (feature 2026092001-online-order-intake-dispatch, T-09-01,
 * ADR-08, AC-30).
 *
 * - `sales_orders.confirmed_at` / `confirmed_by` — "Đã duyệt" là CỘT, không phải
 *   giá trị `status`. NULL = chưa duyệt. Không backfill.
 * - `sales_order_dispatch_action_enum` thêm `CONFIRM`; mỗi lần duyệt ghi một
 *   dòng vết với `from_branch_id` và `to_branch_id` đều NULL.
 * - `CHK_sales_order_dispatch_events_shape` thêm nhánh `CONFIRM`; hai nhánh
 *   `DISPATCH` / `RETURN` giữ NGUYÊN như migration `1790100200000`.
 *
 * `transaction = false`, CỐ Ý: Postgres không cho dùng một giá trị enum vừa
 * `ADD VALUE` trong cùng transaction ("New enum values must be committed before
 * they can be used"), mà CHECK mới lại nhắc tới `'CONFIRM'`. Nên `ADD VALUE`
 * chạy riêng (tự commit, `IF NOT EXISTS` để chạy lại được), phần còn lại tự bọc
 * trong một transaction.
 *
 * `down()` phải dựng lại enum vì Postgres không có `DROP VALUE`. Các dòng vết
 * `CONFIRM` bị XOÁ trước — bảng vết append-only, nên revert là mất vết duyệt.
 */
export class AddSalesOrderConfirmation1790100600000 implements MigrationInterface {
  name = 'AddSalesOrderConfirmation1790100600000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "sales_order_dispatch_action_enum" ADD VALUE IF NOT EXISTS 'CONFIRM'`,
    );

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `ALTER TABLE "sales_orders" ADD COLUMN "confirmed_at" TIMESTAMP WITH TIME ZONE`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_orders" ADD COLUMN "confirmed_by" uuid`,
      );
      await queryRunner.query(
        `COMMENT ON COLUMN "sales_orders"."confirmed_at" IS 'Thời điểm duyệt đơn (ADR-08); NULL = chưa duyệt'`,
      );
      await queryRunner.query(
        `COMMENT ON COLUMN "sales_orders"."confirmed_by" IS 'users.id của người duyệt; NULL = chưa duyệt'`,
      );

      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" DROP CONSTRAINT "CHK_sales_order_dispatch_events_shape"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" ADD CONSTRAINT "CHK_sales_order_dispatch_events_shape" CHECK (${NEW_SHAPE_CHECK})`,
      );

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
        `DELETE FROM "sales_order_dispatch_events" WHERE "action" = 'CONFIRM'`,
      );

      // CHECK nhắc tới literal của enum: phải gỡ trước khi đổi kiểu cột, nếu
      // không Postgres dựng lại nó với literal của kiểu cũ và báo lỗi toán tử.
      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" DROP CONSTRAINT "CHK_sales_order_dispatch_events_shape"`,
      );

      await queryRunner.query(
        `ALTER TYPE "sales_order_dispatch_action_enum" RENAME TO "sales_order_dispatch_action_enum_old"`,
      );
      await queryRunner.query(
        `CREATE TYPE "sales_order_dispatch_action_enum" AS ENUM ('DISPATCH', 'RETURN')`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" ALTER COLUMN "action" TYPE "sales_order_dispatch_action_enum" USING "action"::text::"sales_order_dispatch_action_enum"`,
      );
      await queryRunner.query(
        `DROP TYPE "sales_order_dispatch_action_enum_old"`,
      );

      await queryRunner.query(
        `ALTER TABLE "sales_order_dispatch_events" ADD CONSTRAINT "CHK_sales_order_dispatch_events_shape" CHECK (${OLD_SHAPE_CHECK})`,
      );

      await queryRunner.query(
        `ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "confirmed_by"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "confirmed_at"`,
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}
