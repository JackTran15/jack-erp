import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a free-text "description" (Mô tả) column to locations so the
 * "Vị trí hàng hóa" list can show the MISA-style "Mô tả" column.
 */
export class AddLocationDescription1782700000000 implements MigrationInterface {
  name = 'AddLocationDescription1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" ADD COLUMN "description" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" DROP COLUMN IF EXISTS "description"`,
    );
  }
}
