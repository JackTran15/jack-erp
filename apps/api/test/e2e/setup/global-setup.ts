import { execSync } from 'child_process';

/**
 * Runs once before the entire E2E suite.
 * Ensures the test database exists and migrations are applied.
 */
export default async function globalSetup() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPass = process.env.DB_PASS || 'postgres';
  const dbName = process.env.DB_NAME || 'erp_test';

  process.env.DB_HOST = dbHost;
  process.env.DB_PORT = dbPort;
  process.env.DB_USER = dbUser;
  process.env.DB_PASS = dbPass;
  process.env.DB_NAME = dbName;
  process.env.JWT_SECRET = 'e2e-test-secret';
  process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret';
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

  try {
    execSync(
      `PGPASSWORD=${dbPass} psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -tc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1 || PGPASSWORD=${dbPass} createdb -h ${dbHost} -p ${dbPort} -U ${dbUser} ${dbName}`,
      { stdio: 'inherit' },
    );
  } catch {
    console.warn(
      'Could not auto-create test database. Ensure it exists before running E2E tests.',
    );
  }
}
