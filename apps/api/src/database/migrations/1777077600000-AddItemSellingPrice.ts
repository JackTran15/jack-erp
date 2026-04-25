import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemSellingPrice1777077600000 implements MigrationInterface {
  name = 'AddItemSellingPrice1777077600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "items" ADD "selling_price" decimal(18,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "selling_price"`);
  }
}
