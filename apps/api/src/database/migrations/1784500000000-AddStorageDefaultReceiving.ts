import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduce an explicit "default receiving warehouse" flag on storages,
 * separate from the auto-generated showroom flag (is_main_storage).
 *
 * (1) ADD COLUMN is_default_receiving (boolean, default false);
 * (2) partial unique index enforcing at most one default receiving warehouse
 *     per branch;
 * (3) backfill is_default_receiving = true for every showroom storage
 *     (is_main_storage = true) so existing branches keep a sensible inbound
 *     default — historically is_main_storage doubled as the receiving default.
 */
export class AddStorageDefaultReceiving1784500000000
  implements MigrationInterface
{
  name = 'AddStorageDefaultReceiving1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "storages" ADD COLUMN "is_default_receiving" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `UPDATE "storages" SET "is_default_receiving" = true WHERE "is_main_storage" = true`,
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
