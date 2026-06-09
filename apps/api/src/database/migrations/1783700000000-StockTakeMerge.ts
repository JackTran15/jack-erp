import { MigrationInterface, QueryRunner } from "typeorm";

export class StockTakeMerge1783700000000 implements MigrationInterface {
  name = "StockTakeMerge1783700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN "merged_into_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN "merge_source_ids" uuid[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD COLUMN "merged_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_takes_merged_into_id" ON "stock_takes" ("merged_into_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" ADD CONSTRAINT "FK_stock_takes_merged_into_id" FOREIGN KEY ("merged_into_id") REFERENCES "stock_takes"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP CONSTRAINT "FK_stock_takes_merged_into_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_stock_takes_merged_into_id"`);
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN "merged_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN "merge_source_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_takes" DROP COLUMN "merged_into_id"`,
    );
  }
}
