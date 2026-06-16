import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a dedicated "Mặc định" (default) location per showroom storage. POS sells
 * from this location when a product has no assigned shelf, so every POS-visible
 * product is sellable without manual setup; "Xếp vị trí" relocates it onto a
 * real shelf later. Unlike the hidden "Chưa xếp" location, this is a visible,
 * selectable shelf.
 *
 * (1) ADD COLUMN is_default (boolean, default false);
 * (2) partial unique index enforcing at most one default location per storage;
 * (3) backfill one default location for every showroom backing storage
 *     (is_main_storage = true) that lacks one, inheriting the storage's
 *     organization_id / branch_id / created_by.
 */
export class AddDefaultLocation1784100000000 implements MigrationInterface {
  name = 'AddDefaultLocation1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" ADD COLUMN "is_default" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_locations_default_per_storage" ON "locations" ("storage_id") WHERE "is_default" = true`,
    );

    await queryRunner.query(
      `INSERT INTO "locations" ("id", "organization_id", "branch_id", "created_by", "code", "name", "storage_id", "type", "is_active", "is_default")
       SELECT uuid_generate_v4(), s."organization_id", s."branch_id", s."created_by", 'DEFAULT', 'Mặc định', s."id", 'SHELF', true, true
       FROM "storages" s
       WHERE s."is_main_storage" = true
         AND NOT EXISTS (
           SELECT 1 FROM "locations" l
           WHERE l."storage_id" = s."id" AND l."is_default" = true
         )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "locations" WHERE "is_default" = true`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_locations_default_per_storage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" DROP COLUMN IF EXISTS "is_default"`,
    );
  }
}
