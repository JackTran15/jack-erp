import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduce an explicit "default receiving warehouse" flag on storages,
 * separate from the auto-generated showroom flag (is_main_storage).
 *
 * (1) ADD COLUMN is_default_receiving (boolean, default false);
 * (2) partial unique index enforcing at most one default receiving warehouse
 *     per branch;
 * (3) backfill is_default_receiving = true for ONE showroom storage
 *     (is_main_storage = true) per branch so existing branches keep a sensible
 *     inbound default — historically is_main_storage doubled as the receiving
 *     default. Some branches carry >1 main storage, so we pick a single
 *     deterministic one (earliest created, tie-broken by id).
 */
export class AddStorageDefaultReceiving1784500000000
  implements MigrationInterface
{
  name = 'AddStorageDefaultReceiving1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "storages" ADD COLUMN "is_default_receiving" boolean NOT NULL DEFAULT false`,
    );

    // Some branches carry >1 main storage; pick a single deterministic one
    // (earliest created, tie-broken by id) so the per-branch unique index holds.
    await queryRunner.query(
      `UPDATE "storages" SET "is_default_receiving" = true
       WHERE "id" IN (
         SELECT DISTINCT ON ("branch_id") "id"
         FROM "storages"
         WHERE "is_main_storage" = true AND "branch_id" IS NOT NULL
         ORDER BY "branch_id", "created_at" ASC, "id" ASC
       )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_storages_default_receiving_per_branch" ON "storages" ("branch_id") WHERE "is_default_receiving" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_storages_default_receiving_per_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storages" DROP COLUMN IF EXISTS "is_default_receiving"`,
    );
  }
}
