import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes saved report layouts branch-scoped (ADR-01).
 *
 * `report_templates.branch_id` has existed since the table was created (it comes
 * from `BaseEntity`) but no write path has ever set it — every row is NULL. From
 * here NULL carries meaning: it is the *chain default*, inherited by any branch
 * that has not saved a layout of its own. A non-null `branch_id` overrides it.
 *
 * Two things happen:
 *
 * 1. The unique index widens to include the branch. `COALESCE(branch_id, '')` is
 *    load-bearing, not decoration: Postgres treats two NULLs as distinct, so a
 *    plain `(organization_id, branch_id, report_type, name)` index would stop
 *    protecting chain rows against duplicate names entirely (ADR-04).
 *
 * 2. Every live chain row is cloned onto every ACTIVE branch of the same
 *    organization, so no branch loses the layout it is currently looking at and
 *    each can diverge immediately. The chain rows are left untouched — they stay
 *    as the default that branches created later will inherit (ADR-07).
 *
 * The clone is idempotent: re-running it inserts nothing. That is deliberate, so
 * the same statement can be lifted out and run by hand for a newly opened branch.
 */
export class AddBranchScopeToReportTemplates1789400000000
  implements MigrationInterface
{
  name = 'AddBranchScopeToReportTemplates1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_report_templates_org_type_name"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_report_templates_org_branch_type_name" ON "report_templates" ("organization_id", COALESCE("branch_id", ''), "report_type", "name") WHERE "deleted_at" IS NULL`,
    );

    // `b.id` is uuid, `report_templates.branch_id` is varchar — the cast is
    // required, not stylistic.
    //
    // The NOT EXISTS guard deliberately does NOT filter on `deleted_at`. After a
    // down/up cycle the branch rows are sitting soft-deleted; skipping them would
    // insert fresh duplicates that collide with the soft-deleted originals the
    // moment anyone restores one, and re-running up() would grow the table every
    // time. Matching regardless of `deleted_at` keeps the statement a true no-op
    // on a second run (ADR-06).
    //
    // The trade this makes: a down/up cycle does not resurrect the branch rows —
    // they stay soft-deleted and every branch falls back to the chain default
    // until someone saves again. Verified on erp_dev: 7 rows before, 7 after, no
    // 23505. Reviving them instead would also revive rows users had deleted on
    // purpose, which is the worse of the two wrongs.
    await queryRunner.query(`
      INSERT INTO "report_templates"
        ("id", "organization_id", "branch_id", "report_type", "name", "description",
         "columns", "filters", "sort_order", "created_at", "updated_at", "created_by")
      SELECT uuid_generate_v4(), t."organization_id", b."id"::text, t."report_type",
             t."name", t."description", t."columns", t."filters", t."sort_order",
             now(), now(), t."created_by"
      FROM "report_templates" t
      JOIN "branches" b
        ON b."organization_id" = t."organization_id"
       AND b."status" = 'ACTIVE'
      WHERE t."branch_id" IS NULL
        AND t."deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "report_templates" x
          WHERE x."organization_id" = t."organization_id"
            AND x."branch_id" = b."id"::text
            AND x."report_type" = t."report_type"
            AND x."name" = t."name"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Soft-delete rather than DELETE: the old index carries
    // `WHERE deleted_at IS NULL`, so soft-deleted branch rows drop out of it and
    // the org-wide constraint can be restored without destroying layouts a user
    // built. They are parked, not restored — see the note in up().
    await queryRunner.query(
      `UPDATE "report_templates" SET "deleted_at" = now() WHERE "branch_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_report_templates_org_branch_type_name"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_report_templates_org_type_name" ON "report_templates" ("organization_id", "report_type", "name") WHERE "deleted_at" IS NULL`,
    );
  }
}
