import { MigrationInterface, QueryRunner } from 'typeorm';

/** Enables the unaccent extension for accent-insensitive storage name lookups in location import. */
export class AddUnaccentExtension1782500000000 implements MigrationInterface {
  name = 'AddUnaccentExtension1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally not dropping — other queries may depend on it.
  }
}
