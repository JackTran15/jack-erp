/**
 * Upsert the invoice-report type catalogue into report_types.
 *
 * Normally synced automatically on app boot (ReportTypeSyncService); this script
 * is for a manual re-sync without booting the API (e.g. after adding a report
 * type to report-types.seed.ts).
 *
 * Run: pnpm --filter @erp/api seed:report-types
 */
import { AppDataSource } from '../data-source';
import { REPORT_TYPE_SEEDS } from '../../modules/reporting/invoice-report/report-types.seed';

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    for (const seed of REPORT_TYPE_SEEDS) {
      await AppDataSource.query(
        `
        INSERT INTO report_types (id, key, name, sort_order, is_active)
        VALUES (gen_random_uuid(), $1, $2, $3, true)
        ON CONFLICT (key) DO UPDATE SET
          name = EXCLUDED.name,
          sort_order = EXCLUDED.sort_order
        `,
        [seed.key, seed.name, seed.sortOrder],
      );
    }
    console.log(`Upserted ${REPORT_TYPE_SEEDS.length} report types.`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
