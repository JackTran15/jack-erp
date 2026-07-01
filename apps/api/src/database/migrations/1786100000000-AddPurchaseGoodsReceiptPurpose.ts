import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseGoodsReceiptPurpose1786100000000 implements MigrationInterface {
  name = "AddPurchaseGoodsReceiptPurpose1786100000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "goods_receipt_purpose_enum" ADD VALUE IF NOT EXISTS 'PURCHASE' BEFORE 'OTHER'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely; keep PURCHASE inert.
  }
}
