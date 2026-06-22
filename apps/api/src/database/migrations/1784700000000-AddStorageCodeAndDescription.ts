import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add user-facing "code" (Mã kho) and free-text "description" (Diễn giải) to
 * storages so the warehouse edit form can match the MISA layout.
 *
 * (1) ADD COLUMN code (nullable — existing rows and the auto-generated showroom
 *     storage have none);
 * (2) ADD COLUMN description (nullable text);
 * (3) partial unique index on (branch_id, code) WHERE code IS NOT NULL so a
 *     branch cannot have two storages sharing the same code, while still
 *     allowing the many code-less legacy/showroom rows.
 */
export class AddStorageCodeAndDescription1784700000000
  implements MigrationInterface
{
  name = 'AddStorageCodeAndDescription1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "storages" ADD COLUMN "code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "storages" ADD COLUMN "description" text`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_storages_code_per_branch" ON "storages" ("branch_id", "code") WHERE "code" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_storages_code_per_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storages" DROP COLUMN IF EXISTS "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storages" DROP COLUMN IF EXISTS "code"`,
    );
  }
}
