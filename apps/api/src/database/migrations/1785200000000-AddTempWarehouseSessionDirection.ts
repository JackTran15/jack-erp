import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTempWarehouseSessionDirection1785200000000
  implements MigrationInterface
{
  name = 'AddTempWarehouseSessionDirection1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "temp_warehouse_sessions"
        ADD COLUMN "direction" varchar(30) NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "temp_warehouse_sessions"."direction" IS
        'warehouse_to_showroom (w2s) | showroom_to_warehouse (s2w) — NULL for legacy combined sessions'
    `);

    // Swap the one-active-session-per-branch constraint for one-per-(branch, direction)
    // so a branch can hold a w2s and an s2w session simultaneously.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_temp_wh_one_active_per_branch"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_temp_wh_one_active_per_branch_direction"
        ON "temp_warehouse_sessions" ("branch_id", "direction")
        WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_temp_wh_one_active_per_branch_direction"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_temp_wh_one_active_per_branch"
        ON "temp_warehouse_sessions" ("branch_id")
        WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "temp_warehouse_sessions" DROP COLUMN "direction"`,
    );
  }
}
