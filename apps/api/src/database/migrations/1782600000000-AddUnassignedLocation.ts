import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a virtual "Chưa xếp" (unassigned) location per storage. Stock received
 * without an explicit shelf lands here; "Xếp vị trí" moves it onto real shelves.
 *
 * (1) ADD COLUMN is_unassigned (boolean, default false);
 * (2) partial unique index enforcing at most one unassigned location per storage;
 * (3) backfill one unassigned location for every existing storage that lacks one,
 *     inheriting the storage's organization_id / branch_id / created_by.
 */
export class AddUnassignedLocation1782600000000 implements MigrationInterface {
  name = 'AddUnassignedLocation1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" ADD COLUMN "is_unassigned" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_locations_unassigned_per_storage" ON "locations" ("storage_id") WHERE "is_unassigned" = true`,
    );

    await queryRunner.query(
      `INSERT INTO "locations" ("id", "organization_id", "branch_id", "created_by", "code", "name", "storage_id", "type", "is_active", "is_unassigned")
       SELECT uuid_generate_v4(), s."organization_id", s."branch_id", s."created_by", '__UNASSIGNED__', 'Chưa xếp', s."id", 'ZONE', true, true
       FROM "storages" s
       WHERE NOT EXISTS (
         SELECT 1 FROM "locations" l
         WHERE l."storage_id" = s."id" AND l."is_unassigned" = true
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "locations" WHERE "is_unassigned" = true`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_locations_unassigned_per_storage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" DROP COLUMN IF EXISTS "is_unassigned"`,
    );
  }
}
