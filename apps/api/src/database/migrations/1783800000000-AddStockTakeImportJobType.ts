import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStockTakeImportJobType1783800000000
  implements MigrationInterface
{
  name = "AddStockTakeImportJobType1783800000000";

  public async up(q: QueryRunner): Promise<void> {
    // PG16 cho phép ADD VALUE trong transaction miễn là không dùng value mới ngay trong cùng transaction.
    await q.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'STOCK_TAKE'`,
    );
    // Cột reference chung để gắn job với bản ghi gốc (vd: stockTakeId cho STOCK_TAKE).
    await q.query(
      `ALTER TABLE "inventory_import_jobs" ADD COLUMN IF NOT EXISTS "reference_id" uuid NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "inventory_import_jobs" DROP COLUMN IF EXISTS "reference_id"`,
    );
    // PostgreSQL không drop được 1 enum value đơn lẻ; giữ 'STOCK_TAKE' lại (vô hại).
  }
}
