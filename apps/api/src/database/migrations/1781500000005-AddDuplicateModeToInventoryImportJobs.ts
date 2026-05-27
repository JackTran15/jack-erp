import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDuplicateModeToInventoryImportJobs1781500000005 implements MigrationInterface {
  name = "AddDuplicateModeToInventoryImportJobs1781500000005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "inventory_import_duplicate_mode_enum" AS ENUM ('UPDATE', 'SKIP');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_import_jobs"
      ADD COLUMN IF NOT EXISTS "duplicate_mode" "inventory_import_duplicate_mode_enum" NOT NULL DEFAULT 'UPDATE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_import_jobs" DROP COLUMN IF EXISTS "duplicate_mode"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "inventory_import_duplicate_mode_enum"
    `);
  }
}
