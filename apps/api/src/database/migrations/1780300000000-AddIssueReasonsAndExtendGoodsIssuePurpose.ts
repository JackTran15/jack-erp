import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssueReasonsAndExtendGoodsIssuePurpose1780300000000
  implements MigrationInterface
{
  name = 'AddIssueReasonsAndExtendGoodsIssuePurpose1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum + table for issue_reasons
    await queryRunner.query(
      `CREATE TYPE "issue_reason_purpose_enum" AS ENUM ('OTHER', 'DISPOSAL')`,
    );

    await queryRunner.query(`
      CREATE TABLE "issue_reasons" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" varchar NOT NULL,
        "branch_id"       varchar NULL,
        "code"            varchar(64) NOT NULL,
        "name"            varchar(255) NOT NULL,
        "purpose"         "issue_reason_purpose_enum" NOT NULL,
        "is_active"       boolean NOT NULL DEFAULT true,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      varchar NOT NULL,
        CONSTRAINT "PK_issue_reasons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issue_reasons_org_code" UNIQUE ("organization_id", "code")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_issue_reasons_org_purpose" ON "issue_reasons" ("organization_id", "purpose")`,
    );

    // 2. Extend goods_issue_purpose_enum with TRANSFER_OUT and DISPOSAL
    await queryRunner.query(
      `ALTER TYPE "goods_issue_purpose_enum" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "goods_issue_purpose_enum" ADD VALUE IF NOT EXISTS 'DISPOSAL'`,
    );

    // 3. Add FK columns to goods_issues
    await queryRunner.query(`
      ALTER TABLE "goods_issues"
        ADD COLUMN IF NOT EXISTS "reason_id"        uuid NULL,
        ADD COLUMN IF NOT EXISTS "target_branch_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "goods_issues"
        ADD CONSTRAINT "FK_goods_issues_reason"
          FOREIGN KEY ("reason_id") REFERENCES "issue_reasons"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_goods_issues_reason_id" ON "goods_issues" ("reason_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_goods_issues_target_branch_id" ON "goods_issues" ("target_branch_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_goods_issues_target_branch_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_goods_issues_reason_id"`);
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP CONSTRAINT IF EXISTS "FK_goods_issues_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "target_branch_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "reason_id"`,
    );

    // Note: Postgres cannot drop a single enum value. Rebuilding the enum
    // requires recreating dependent columns; since this migration only adds
    // values, we leave them in place on rollback to avoid destructive churn.

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issue_reasons_org_purpose"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_reasons"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "issue_reason_purpose_enum"`);
  }
}
