import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `uq_invoice_org_code` from `(organization_id, code)` to
 * `(organization_id, branch_id, code)`. A-10/ADR-07 reverses A-02/ADR-06: each
 * branch now gets its own numbering counter, so two branches issuing invoices
 * on the same day legitimately land on the same `code` string — the old
 * org-wide constraint would have rejected the second one with 23505.
 *
 * `branch_id` is not made NOT NULL here; a branch-less invoice (if one ever
 * exists) simply isn't protected against code collisions by this index. Not
 * this ticket's concern — see ADR-07.
 */
export class WidenInvoiceCodeUniqueToBranch1789300200000
  implements MigrationInterface
{
  name = 'WidenInvoiceCodeUniqueToBranch1789300200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_invoice_org_code"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invoice_org_branch_code" ON "invoices" ("organization_id", "branch_id", "code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting to the org-wide constraint would fail immediately if two
    // branches currently hold the same code — check first and refuse to
    // silently create a constraint the existing data already violates
    // (same spirit as ADR-06's original guard, applied in reverse).
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM invoices
          GROUP BY organization_id, code
          HAVING COUNT(DISTINCT branch_id) > 1
        ) THEN
          RAISE EXCEPTION 'Cannot revert uq_invoice_org_branch_code: some (organization_id, code) pairs are currently shared across multiple branches and would violate the org-wide uq_invoice_org_code constraint. Resolve the duplicates before reverting.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP INDEX "uq_invoice_org_branch_code"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invoice_org_code" ON "invoices" ("organization_id", "code")`,
    );
  }
}
