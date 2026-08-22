import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `UQ_active_rule_scope` was a plain UNIQUE constraint over
 * (organization_id, branch_id, document_type, is_active). Every org-wide rule is
 * written with branch_id NULL, and Postgres treats NULLs as distinct in a unique
 * index, so the constraint accepted an unlimited number of identical active
 * org-wide rules — it never protected the case it was named for.
 *
 * Two concurrent `generate` calls for a document type that has no rule yet both
 * resolved "no rule", both auto-created one, and each got its own counter: the
 * same number was issued twice, and kept being issued twice afterwards because
 * `resolveActiveRule` picks whichever row Postgres returns first.
 *
 * Partial indexes fix that by excluding NULL from the key: the org-wide default
 * is keyed on (organization_id, document_type) alone, and branch overrides get
 * their own index. Both are still allowed to coexist — a branch rule overriding
 * the org default is the intended feature.
 *
 * No equivalent index belongs on `deposit_movements`: its `document_number` is
 * not a minted number, it is a copy of the source invoice code, deliberately
 * shared by every payment line of that invoice (a two-payment sale writes two
 * movements carrying the same code). The minted BANK_RECEIPT number lives on
 * `bank_receipts`, which already has `uniq_bank_receipts_org_document_number`;
 * per-line double-post on movements is blocked by `uniq_deposit_movements_source_ref`.
 */
export class AddDocumentNumberRuleScopeIndexes1789200000000
  implements MigrationInterface
{
  name = 'AddDocumentNumberRuleScopeIndexes1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_number_rules" DROP CONSTRAINT IF EXISTS "UQ_active_rule_scope"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_doc_rule_org_default"
      ON "document_number_rules" ("organization_id", "document_type")
      WHERE "is_active" AND "branch_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_doc_rule_org_branch"
      ON "document_number_rules" ("organization_id", "branch_id", "document_type")
      WHERE "is_active" AND "branch_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_doc_rule_org_branch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_doc_rule_org_default"`);
    await queryRunner.query(`
      ALTER TABLE "document_number_rules"
      ADD CONSTRAINT "UQ_active_rule_scope"
      UNIQUE ("organization_id", "branch_id", "document_type", "is_active")
    `);
  }
}
