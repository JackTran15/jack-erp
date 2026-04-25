import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemPurchasePrice1777310000000 implements MigrationInterface {
  name = 'AddItemPurchasePrice1777310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "items" ADD "purchase_price" decimal(18,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "purchase_price"`);
  }
}
