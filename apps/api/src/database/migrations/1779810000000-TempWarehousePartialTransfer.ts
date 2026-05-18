import { MigrationInterface, QueryRunner } from 'typeorm';

export class TempWarehousePartialTransfer1779810000000
  implements MigrationInterface
{
  name = 'TempWarehousePartialTransfer1779810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "temp_warehouse_lines"
        ADD COLUMN "transfer_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "temp_warehouse_lines"
        ADD CONSTRAINT "FK_temp_wh_lines_transfer"
        FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "temp_warehouse_lines"."status" IS 'ACTIVE | DELETED | AUTO_BALANCED | TRANSFERRED'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_temp_wh_lines_session_transferred"
        ON "temp_warehouse_lines" ("session_id")
        WHERE "status" = 'TRANSFERRED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_temp_wh_lines_session_transferred"`,
    );
    await queryRunner.query(
      `ALTER TABLE "temp_warehouse_lines" DROP CONSTRAINT IF EXISTS "FK_temp_wh_lines_transfer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "temp_warehouse_lines" DROP COLUMN IF EXISTS "transfer_id"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "temp_warehouse_lines"."status" IS NULL`,
    );
  }
}
