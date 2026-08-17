import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Indexes for the "Hàng hóa xuất kho tạm" report.
 *
 * The report ran three sequential scans on tables that grow forever:
 *   - `base`       — temp_warehouse_lines filtered by org + period + branch
 *   - `tw_claimed` — temp_warehouse_lines that carry an invoice; bounded by the
 *                    invoices in scope, but NOT by the line's own stage date
 *                    (a claim line may be created outside the invoice's period,
 *                    and dropping it would let the showroom source double-count
 *                    that sale)
 *   - `showroom`   — invoices filtered by COALESCE(issued_at, created_at),
 *                    which the existing IDX_invoices_org_branch_issued_at
 *                    cannot serve because the index is on the bare column
 *
 * No behaviour change; these only give the planner something to use.
 */
export class AddTempWarehouseReportIndexes1786982249527
  implements MigrationInterface
{
  name = "AddTempWarehouseReportIndexes1786982249527";

  public async up(q: QueryRunner): Promise<void> {
    // branch_id comes last on purpose: the report passes it as `= ANY(array)`,
    // which does not become an index condition in a middle position — as the
    // trailing column it is still resolved from the index tuple, so the scan
    // stays index-only.
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_twl_org_created_branch" ON "temp_warehouse_lines" ("organization_id", "created_at", "branch_id")`,
    );

    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_twl_claimed_by_invoice" ON "temp_warehouse_lines" ("organization_id", "invoice_id", "item_id") INCLUDE ("quantity", "status") WHERE "invoice_id" IS NOT NULL AND "direction" = 'warehouse_to_showroom'`,
    );

    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_invoices_org_branch_effective_at" ON "invoices" ("organization_id", "branch_id", (COALESCE("issued_at", "created_at")))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_invoices_org_branch_effective_at"`);
    await q.query(`DROP INDEX IF EXISTS "idx_twl_claimed_by_invoice"`);
    await q.query(`DROP INDEX IF EXISTS "idx_twl_org_created_branch"`);
  }
}
