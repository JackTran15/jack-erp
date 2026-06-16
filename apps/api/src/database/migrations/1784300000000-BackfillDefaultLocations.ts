import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-run the per-main-storage default-location backfill for storages created
 * after 1784100000000-AddDefaultLocation (e.g. seed-created branches, whose
 * storages are inserted after migrations run). Without a "Mặc định"
 * (is_default) location the POS location resolver cannot fall back, so any
 * imported / unmapped item fails checkout with "has items without an assigned
 * location". UI-created branches already get one from BranchService.
 *
 * Same idempotent insert as AddDefaultLocation: only main storages lacking a
 * default location get one, guarded further by UQ_locations_default_per_storage.
 */
export class BackfillDefaultLocations1784300000000
  implements MigrationInterface
{
  name = 'BackfillDefaultLocations1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(): Promise<void> {
    // Intentionally no-op: data backfill. Manual cleanup if needed.
  }
}
