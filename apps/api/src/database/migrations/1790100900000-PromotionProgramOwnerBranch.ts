import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CTKM theo chi nhánh (2026100301 T-01-01, ADR-01): chi nhánh **quản lý** một
 * chương trình. NULL = chương trình toàn chuỗi (công ty quản lý).
 *
 * Không backfill: mọi chương trình đã có đều là của công ty (A-05), kể cả
 * chương trình chỉ áp dụng tại một cửa hàng — phạm vi áp dụng nằm ở
 * `promotion_branches`, còn `branch_id` kế thừa từ BaseEntity là chi nhánh của
 * người tạo và không mang nghĩa sở hữu.
 */
export class PromotionProgramOwnerBranch1790100900000 implements MigrationInterface {
  name = 'PromotionProgramOwnerBranch1790100900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotion_programs" ADD "owner_branch_id" uuid NULL`);
    await queryRunner.query(
      `ALTER TABLE "promotion_programs" ADD CONSTRAINT "FK_promotion_programs_owner_branch"
         FOREIGN KEY ("owner_branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_promotion_programs_org_owner" ON "promotion_programs" ("organization_id", "owner_branch_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_promotion_programs_org_owner"`);
    await queryRunner.query(`ALTER TABLE "promotion_programs" DROP CONSTRAINT "FK_promotion_programs_owner_branch"`);
    await queryRunner.query(`ALTER TABLE "promotion_programs" DROP COLUMN "owner_branch_id"`);
  }
}
