import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { applyUtcTimestampCodec } from './utc-timestamp-codec';

applyUtcTimestampCodec();

// dotenv.config() does NOT override already-set process.env keys, so files
// loaded earlier win. Order = highest precedence first:
//   1. apps/api/.env            (per-package override, if present)
//   2. <monorepo-root>/.env     (where credentials actually live)
//   3. apps/api/.env.example    (last-resort defaults)
//
// __dirname is apps/api/{src,dist}/database, so ../.. -> apps/api and
// ../../../.. -> monorepo root.
const apiPackageRoot = path.resolve(__dirname, '..', '..');
const monorepoRoot = path.resolve(__dirname, '..', '..', '..', '..');

dotenvConfig({ path: path.join(apiPackageRoot, '.env') });
dotenvConfig({ path: path.join(monorepoRoot, '.env') });
dotenvConfig({ path: path.join(apiPackageRoot, '.env.example') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  database: process.env.DB_NAME || 'erp_dev',
  username: process.env.DB_USER || 'erp_user',
  password: process.env.DB_PASS || 'erp_secret',
  // Postgres has no top-level `timezone` DataSource option (that's a mysql2-only
  // TypeORM field) — pin the session's TimeZone GUC via the pg `options` startup
  // parameter instead, which TypeORM merges verbatim into the pg.Pool config.
  //
  // The value must be UTC, not the business zone. The GUC is what a naive
  // column's `DEFAULT now()` / `CURRENT_TIMESTAMP` casts through, so it decides
  // what the 198 `timestamp without time zone` columns actually store; the rest
  // of the app (report SQL, e2e fixtures, every row written before the pin
  // existed) reads them as UTC. Pinning the business zone here silently made
  // those columns hold Vietnam wall clock instead, which shifted every report
  // that renders one by +7h. Display timezone is a presentation concern and is
  // pinned in the frontend formatters, not on the connection.
  extra: { options: '-c timezone=UTC' },
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  // Commit each migration in its own transaction. Postgres forbids using a
  // newly-added enum value in the same transaction it was added in, so an
  // "ALTER TYPE ... ADD VALUE" migration must commit before a later migration
  // can reference that value (e.g. WAREHOUSE -> BackfillStorageCode).
  migrationsTransactionMode: 'each',
  synchronize: false,
});
