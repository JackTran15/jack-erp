import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turn the transfer order (Lệnh điều chuyển) into a two-phase transfer voucher.
 *
 * (1) Rebuild the status enum DRAFT|APPROVED|EXECUTED|CANCELLED →
 *     DRAFT|IN_PROGRESS|COMPLETED|CANCELLED, remapping existing rows
 *     (EXECUTED→COMPLETED, APPROVED→DRAFT) in the same column cast. Done by
 *     recreating the type (ALTER TYPE ... ADD VALUE cannot run inside the
 *     migration transaction).
 * (2) Add the two-phase columns on transfer_orders (export/import linkage,
 *     timestamps, attachments). Legacy approved/executed columns stay.
 * (3) Add per-line source/destination storage on transfer_order_lines.
 */
export class TransferOrderTwoPhase1782900000000 implements MigrationInterface {
  name = 'TransferOrderTwoPhase1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // (1) Rebuild status enum + remap rows. The legacy type is named
    // "transfer_order_status_enum" (singular) while TypeORM's default for the
    // "transfer_orders" table is the plural "transfer_orders_status_enum" — we
    // recreate it under the plural name so it matches the entity (no drift) and
    // drop the singular legacy type.
    await queryRunner.query(
      `CREATE TYPE "transfer_orders_status_enum" AS ENUM ('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ALTER COLUMN "status" TYPE "transfer_orders_status_enum"
       USING (CASE
         WHEN "status"::text = 'EXECUTED' THEN 'COMPLETED'
         WHEN "status"::text = 'APPROVED' THEN 'DRAFT'
         ELSE "status"::text
       END::"transfer_orders_status_enum")`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`DROP TYPE "transfer_order_status_enum"`);

    // (2) Two-phase columns on transfer_orders.
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "attachment_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "export_goods_issue_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "import_goods_receipt_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "exported_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "exported_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "completed_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid`,
    );

    // (3) Per-line source storage (the warehouse to pull each line from at
    // export). The destination warehouse is chosen once at import time and
    // recorded on the header (transfer_orders.destination_storage_id).
    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" ADD COLUMN IF NOT EXISTS "source_storage_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfer_order_lines" DROP COLUMN IF EXISTS "source_storage_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "cancelled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "cancelled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "completed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "completed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "exported_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "exported_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "import_goods_receipt_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "export_goods_issue_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" DROP COLUMN IF EXISTS "attachment_ids"`,
    );

    // Restore the legacy singular enum, remapping IN_PROGRESS→APPROVED, COMPLETED→EXECUTED.
    await queryRunner.query(
      `CREATE TYPE "transfer_order_status_enum" AS ENUM ('DRAFT','APPROVED','EXECUTED','CANCELLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ALTER COLUMN "status" TYPE "transfer_order_status_enum"
       USING (CASE
         WHEN "status"::text = 'COMPLETED' THEN 'EXECUTED'
         WHEN "status"::text = 'IN_PROGRESS' THEN 'APPROVED'
         ELSE "status"::text
       END::"transfer_order_status_enum")`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`DROP TYPE "transfer_orders_status_enum"`);
  }
}
