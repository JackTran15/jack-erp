import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTempWarehouseLineSourceLocationId1784900000000
  implements MigrationInterface
{
  name = 'AddTempWarehouseLineSourceLocationId1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE temp_warehouse_lines
      ADD COLUMN IF NOT EXISTS source_location_id uuid NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN temp_warehouse_lines.source_location_id IS
        'Shelf/location on the source side of the movement (warehouse or showroom shelf picked in POS)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE temp_warehouse_lines
      DROP COLUMN IF EXISTS source_location_id
    `);
  }
}
