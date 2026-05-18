import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockTransferPerLineLocations1780100000000
  implements MigrationInterface
{
  name = 'StockTransferPerLineLocations1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_transfer_lines"
        ADD COLUMN IF NOT EXISTS "source_location_id"      uuid NULL,
        ADD COLUMN IF NOT EXISTS "destination_location_id" uuid NULL
    `);

    // Backfill: existing lines inherit locations from parent header.
    await queryRunner.query(`
      UPDATE "stock_transfer_lines" l
      SET    "source_location_id"      = t."source_location_id",
             "destination_location_id" = t."destination_location_id"
      FROM   "stock_transfers" t
      WHERE  l."transfer_id" = t.id
        AND  l."source_location_id" IS NULL
    `);

    // Add FK constraints (allow NULL during transition; new lines must populate them).
    await queryRunner.query(`
      ALTER TABLE "stock_transfer_lines"
        ADD CONSTRAINT "FK_stock_transfer_lines_source_loc"
          FOREIGN KEY ("source_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_stock_transfer_lines_dest_loc"
          FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfer_lines_source_loc"
        ON "stock_transfer_lines" ("source_location_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfer_lines_dest_loc"
        ON "stock_transfer_lines" ("destination_location_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_transfer_lines_dest_loc"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_transfer_lines_source_loc"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stock_transfer_lines"
        DROP CONSTRAINT IF EXISTS "FK_stock_transfer_lines_dest_loc",
        DROP CONSTRAINT IF EXISTS "FK_stock_transfer_lines_source_loc",
        DROP COLUMN IF EXISTS "destination_location_id",
        DROP COLUMN IF EXISTS "source_location_id"
    `);
  }
}
