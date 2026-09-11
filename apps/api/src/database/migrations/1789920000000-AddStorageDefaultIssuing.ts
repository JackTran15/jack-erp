import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduce an explicit "default issuing warehouse" flag on storages,
 * separate from the receiving-side flag (is_default_receiving) and from the
 * auto-generated showroom flag (is_main_storage).
 *
 * (1) ADD COLUMN is_default_issuing (boolean, default false);
 * (2) backfill is_default_issuing = true for ONE real storage per branch so
 *     existing branches keep a sensible outbound default;
 * (3) partial unique index enforcing at most one default issuing warehouse
 *     per branch. Created AFTER the backfill so it never observes an
 *     intermediate state.
 *
 * Two deviations from the receiving-side migration
 * (1784500000000-AddStorageDefaultReceiving), both in the backfill predicate:
 *
 * - `is_main_storage = false` instead of `= true`. The receiving migration
 *   picks the showroom-backing storage because is_main_storage historically
 *   doubled as the receiving default. Outbound is the opposite: POS Kho tạm
 *   filters every isMainStorage out of its warehouse picker
 *   (use-fast-stock-transfer-data.ts:143-146), so flagging the showroom
 *   storage as the issuing default would flag a warehouse POS never shows —
 *   the whole feature would be a silent no-op. Branches with no real storage
 *   at all get no flag, which is correct: nothing to issue from means no
 *   default issuing warehouse.
 * - `is_active = true`, on top of the above. Without it, a branch whose
 *   oldest real storage happens to be deactivated would get that inactive
 *   storage flagged — exactly the state the deactivation guard (T-01-03)
 *   forbids for storages set as default going forward, and POS filters
 *   inactive warehouses out of the picker anyway, so the branch would
 *   effectively still have no usable default.
 */
export class AddStorageDefaultIssuing1789920000000
  implements MigrationInterface
{
  name = 'AddStorageDefaultIssuing1789920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "storages" ADD COLUMN "is_default_issuing" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `UPDATE "storages" SET "is_default_issuing" = true
       WHERE "id" IN (
         SELECT DISTINCT ON ("branch_id") "id"
         FROM "storages"
         WHERE "is_main_storage" = false AND "is_active" = true AND "branch_id" IS NOT NULL
         ORDER BY "branch_id", "created_at" ASC, "id" ASC
       )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_storages_default_issuing_per_branch" ON "storages" ("branch_id") WHERE "is_default_issuing" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_storages_default_issuing_per_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storages" DROP COLUMN IF EXISTS "is_default_issuing"`,
    );
  }
}
