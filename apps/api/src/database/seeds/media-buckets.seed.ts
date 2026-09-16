/**
 * Bootstrap MEDIA_BUCKET_PUBLIC / MEDIA_BUCKET_PRIVATE against the configured
 * S3-compatible endpoint (03-logical-design.md, infrastructure section). Deliberately does not
 * boot AppModule or import `data-source.ts`: `ensureBuckets` only needs the
 * MEDIA_* environment variables, and either would also open a Postgres pool
 * (AppModule a Kafka client too) that this script never touches. So this loads
 * the env files directly, in the same precedence order as
 * `app.module.ts:66-70` / `data-source.ts`, and builds `ObjectStorageService`
 * with a bare `ConfigService` instead of the full Nest app context.
 *
 * Run: pnpm --filter @erp/api media:bootstrap
 */
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from '../../modules/media/object-storage.service';

const apiPackageRoot = path.resolve(__dirname, '..', '..', '..');
const monorepoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

loadEnv({ path: path.join(apiPackageRoot, '.env') });
loadEnv({ path: path.join(monorepoRoot, '.env') });
loadEnv({ path: path.join(apiPackageRoot, '.env.example') });

async function run(): Promise<void> {
  const config = new ConfigService(process.env);
  const storage = new ObjectStorageService(config);
  await storage.ensureBuckets();
  console.log('Media buckets ensured.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
