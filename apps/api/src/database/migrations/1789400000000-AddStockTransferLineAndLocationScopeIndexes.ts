import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two hot reads were running as sequential scans. Measured on the live database
 * with `EXPLAIN (ANALYZE, BUFFERS)`; between them they accounted for roughly
 * 3.3 billion rows read in ~40 hours of normal traffic.
 *
 * 1. `stock_transfer_lines` had indexes on every location/storage column but
 *    none on `transfer_id` — the column used to fetch the lines of a transfer
 *    document. Fetching one document's 3 lines discarded 7,123 rows, and the
 *    pattern ran 346k times.
 *
 * 2. `locations` carried only `storage_id` indexes, so the mandatory tenant
 *    filter (`organization_id` + `branch_id`) scanned the table: 25,339 rows
 *    discarded to return 23, across 67k scans.
 *
 * Both tables are small enough that a plain CREATE INDEX takes milliseconds;
 * CONCURRENTLY is deliberately avoided since migrations run inside a
 * transaction (`migrationsTransactionMode: 'each'`).
 *
 * `organization_id` / `branch_id` are varchar on `locations` (BaseEntity leaves
 * them untyped), which is why the index is created on the columns as-is.
 */
export class AddStockTransferLineAndLocationScopeIndexes1789400000000
  implements MigrationInterface
{
  name = 'AddStockTransferLineAndLocationScopeIndexes1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfer_lines_transfer"
      ON "stock_transfer_lines" ("transfer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_locations_org_branch"
      ON "locations" ("organization_id", "branch_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_locations_org_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_transfer_lines_transfer"`,
    );
  }
}
