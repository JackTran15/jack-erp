import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchasingEmployeeToGoodsReceipts1786300000000
  implements MigrationInterface
{
  name = "AddPurchasingEmployeeToGoodsReceipts1786300000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "goods_receipts" ADD COLUMN "purchasing_employee_id" uuid NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "purchasing_employee_id"`,
    );
  }
}
