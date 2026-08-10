import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';

/**
 * Runs once before the entire E2E suite.
 * Ensures the test database exists and migrations are applied.
 *
 * Jest does not load apps/api/.env automatically (unlike Nest ConfigModule).
 * Load it here so DB_* match docker-compose / local dev credentials.
 *
 * Prefers `.env.test` over `.env` — the suite calls `ds.synchronize(true)`
 * (`resetDatabase()`), a full schema drop+recreate, before every fixture.
 * `.env` alone points at whatever `DB_NAME` a developer's dev environment
 * uses; without a `.env.test` override that drop runs against the real dev
 * database. Discovered live (T-02-05): it failed harmlessly only because an
 * unrelated Postgres extension made the drop error out mid-transaction —
 * with that extension absent it would have silently wiped `erp_dev`.
 */

/** Only ever let the suite point at a database whose name marks it as throwaway. */
const DEFAULT_E2E_DB_NAME = 'erp_test';

export default async function globalSetup() {
  const testEnvPath = path.resolve(__dirname, '../../../.env.test');
  const envPath = fs.existsSync(testEnvPath)
    ? testEnvPath
    : path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(envPath)) {
    loadEnv({ path: envPath });
  }

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPass = process.env.DB_PASS || 'postgres';

  // The suite drops and rebuilds every table (`synchronize(true)` in
  // resetDatabase), so it must never touch the dev database. NEVER fall back to
  // DB_NAME from .env: `process.env.DB_NAME || 'erp_test'` read the DB_NAME
  // dotenv had just loaded one block above, so the erp_test fallback never fired
  // and the suite wiped erp_dev instead. Override with E2E_DB_NAME only.
  const devDbName = process.env.DB_NAME;
  const dbName = process.env.E2E_DB_NAME || DEFAULT_E2E_DB_NAME;
  // Two independent guards, because they fail on different mistakes: the name
  // must look like a throwaway, AND it must not be whatever .env just said the
  // dev database is.
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run E2E against "${dbName}": the suite drops every table. ` +
        `E2E_DB_NAME must contain "test".`,
    );
  }
  if (dbName === devDbName) {
    throw new Error(
      `Refusing to run E2E against "${dbName}": the suite drops every table in it. ` +
        'Point E2E_DB_NAME at a throwaway database.',
    );
  }

  // Hard stop, not a warning: `resetDatabase()` drops this database's entire
  // schema on every fixture. A name that doesn't look disposable is refused
  // outright rather than risking a repeat of the incident above.
  if (!/test/i.test(dbName)) {
    throw new Error(
      `refusing to run E2E against database "${dbName}" — its name doesn't contain ` +
        '"test", and resetDatabase() drops its entire schema on every run. ' +
        `Add ${testEnvPath} with a disposable DB_NAME (e.g. erp_test) before running test:e2e.`,
    );
  }

  process.env.DB_HOST = dbHost;
  process.env.DB_PORT = dbPort;
  process.env.DB_USER = dbUser;
  process.env.DB_PASS = dbPass;
  process.env.DB_NAME = dbName;
  process.env.JWT_SECRET = 'e2e-test-secret';
  process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret';
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

  // `-d postgres` because psql otherwise connects to a database named after the
  // user, which does not exist — the probe always failed and fell through to
  // createdb.
  const psql = `PGPASSWORD=${dbPass} psql -h ${dbHost} -p ${dbPort} -U ${dbUser}`;
  try {
    execSync(
      `${psql} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1 || PGPASSWORD=${dbPass} createdb -h ${dbHost} -p ${dbPort} -U ${dbUser} ${dbName}`,
      { stdio: 'inherit' },
    );
  } catch {
    console.warn(
      'Could not auto-create test database. Ensure it exists before running E2E tests.',
    );
  }

  // Specs rebuild the schema themselves via resetDatabase(), but AppModule
  // queries `permissions` while booting — so createTestApp() fails on a
  // brand-new database unless a schema already exists. Bootstrap it only when
  // the database is genuinely empty: synchronize(true) drops TypeORM's own
  // `migrations` table too, so re-running migrations over a database a previous
  // suite already populated fails on "relation already exists".
  const tableCount = execSync(
    `${psql} -d ${dbName} -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"`,
  )
    .toString()
    .trim();

  if (tableCount === '0') {
    execSync('pnpm migration:run', {
      cwd: path.resolve(__dirname, '..', '..', '..'),
      stdio: 'inherit',
      env: { ...process.env, DB_NAME: dbName },
    });
  }
}
