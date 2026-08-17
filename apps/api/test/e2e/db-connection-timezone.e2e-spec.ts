import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from './setup/test-app';

/**
 * Proves the runtime `TypeOrmModule.forRootAsync` connection (app.module.ts)
 * actually sets the Postgres session timezone to Asia/Ho_Chi_Minh, independent
 * of the test process's own TZ. Unlike data-source.spec.ts (a static config
 * assertion), this needs a live connection because the factory is inline
 * inside `forRootAsync` and not separately exported.
 *
 * No resetDatabase() / seedBaseData() — this only needs a live connection, not
 * seeded data.
 */
describe('DB connection timezone (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const originalTz = process.env.TZ;

  beforeAll(async () => {
    // Must be set before createTestApp() boots the app — the connection's
    // `SET TIME ZONE`-equivalent happens at connect time, not query time.
    process.env.TZ = 'UTC';
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    // Runs with maxWorkers: 1 — a leaked TZ override would bleed into every
    // e2e spec file that runs afterward in the same process.
    process.env.TZ = originalTz;
    await app.close();
  });

  it('reports the Postgres session timezone as Asia/Ho_Chi_Minh even though process.env.TZ is UTC', async () => {
    const rows = await ds.query(
      "SELECT current_setting('TIMEZONE') AS tz",
    );
    expect(rows[0].tz).toBe('Asia/Ho_Chi_Minh');
  });
});
