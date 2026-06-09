import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Upgrade stock transfers from location-to-location (within one storage) to
 * storage-to-storage (kho -> kho) within the same branch:
 *  - stock_transfer_lines gets per-line source/destination storage + valuation
 *    (unit_price / line_value).
 *  - stock_transfers gets transporter, attachments and a transfer timestamp.
 *  - header source/destination location become nullable (per-line storage now
 *    drives the move).
 * Existing rows are backfilled so every line carries the storage of its (legacy)
 * location, and transferred_at mirrors posted_at / created_at.
 */
export class StockTransferInterWarehouse1783300000000
  implements MigrationInterface
{
  name = 'StockTransferInterWarehouse1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── stock_transfer_lines: per-line storage + valuation ──────────────────
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "source_storage_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "destination_storage_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "unit_price" numeric(18,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "line_value" numeric(18,2)`,
    );

    // ── stock_transfers: transporter + attachments + transfer time ──────────
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "transporter_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "transferred_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "attachment_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    // Header locations are legacy now — per-line storage drives the move.
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ALTER COLUMN "source_location_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ALTER COLUMN "destination_location_id" DROP NOT NULL`,
    );

    // ── Backfill per-line storages from the (legacy) line/header location ───
    await queryRunner.query(`
      UPDATE "stock_transfer_lines" l
      SET "source_storage_id" = loc."storage_id"
      FROM "locations" loc
      WHERE loc."id" = COALESCE(
              l."source_location_id",
              (SELECT t."source_location_id" FROM "stock_transfers" t WHERE t."id" = l."transfer_id")
            )
        AND l."source_storage_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "stock_transfer_lines" l
      SET "destination_storage_id" = loc."storage_id"
      FROM "locations" loc
      WHERE loc."id" = COALESCE(
              l."destination_location_id",
              (SELECT t."destination_location_id" FROM "stock_transfers" t WHERE t."id" = l."transfer_id")
            )
        AND l."destination_storage_id" IS NULL
    `);

    // Backfill transfer time for existing documents.
    await queryRunner.query(
      `UPDATE "stock_transfers" SET "transferred_at" = COALESCE("posted_at", "created_at") WHERE "transferred_at" IS NULL`,
    );

    // ── FKs + indexes on the new storage columns ───────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "stock_transfer_lines"
          ADD CONSTRAINT "FK_stock_transfer_lines_source_storage"
          FOREIGN KEY ("source_storage_id") REFERENCES "storages"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "stock_transfer_lines"
          ADD CONSTRAINT "FK_stock_transfer_lines_dest_storage"
          FOREIGN KEY ("destination_storage_id") REFERENCES "storages"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_transfer_lines_source_storage" ON "stock_transfer_lines" ("source_storage_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_transfer_lines_dest_storage" ON "stock_transfer_lines" ("destination_storage_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_transfer_lines_dest_storage"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_transfer_lines_source_storage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP CONSTRAINT IF EXISTS "FK_stock_transfer_lines_dest_storage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP CONSTRAINT IF EXISTS "FK_stock_transfer_lines_source_storage"`,
    );

    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "attachment_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "transferred_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "transporter_user_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP COLUMN IF EXISTS "line_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP COLUMN IF EXISTS "unit_price"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP COLUMN IF EXISTS "destination_storage_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_lines" DROP COLUMN IF EXISTS "source_storage_id"`,
    );

    // Restore NOT NULL on header locations only when no nulls remain.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM "stock_transfers" WHERE "source_location_id" IS NULL) THEN
          ALTER TABLE "stock_transfers" ALTER COLUMN "source_location_id" SET NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "stock_transfers" WHERE "destination_location_id" IS NULL) THEN
          ALTER TABLE "stock_transfers" ALTER COLUMN "destination_location_id" SET NOT NULL;
        END IF;
      END $$;
    `);
  }
}
