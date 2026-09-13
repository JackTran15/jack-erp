/**
 * Manual trigger for `MediaCleanupJob.run()` (ADR-05, 03-logical-design.md), for
 * ops or the UOW-05 demo script. Unlike `media-buckets.seed.ts`, this needs a
 * real database connection, so it goes through `AppDataSource` (same env
 * precedence as every other seed) and builds `MediaCleanupJob`'s two
 * dependencies by hand instead of booting the full Nest app.
 *
 * Run: pnpm --filter @erp/api media:cleanup
 */
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { AppDataSource } from '../data-source';
import { MediaObjectEntity } from '../../modules/media/media-object.entity';
import { ObjectStorageService } from '../../modules/media/object-storage.service';
import { MediaCleanupJob } from '../../modules/media/media-cleanup.job';

const apiPackageRoot = path.resolve(__dirname, '..', '..', '..');
const monorepoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

loadEnv({ path: path.join(apiPackageRoot, '.env') });
loadEnv({ path: path.join(monorepoRoot, '.env') });
loadEnv({ path: path.join(apiPackageRoot, '.env.example') });

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const config = new ConfigService(process.env);
    const storage = new ObjectStorageService(config);
    const mediaRepo = AppDataSource.getRepository(MediaObjectEntity);
    const job = new MediaCleanupJob(mediaRepo, storage);
    const summary = await job.run();
    if (summary.storageUnavailable) {
      // Non-zero exit, distinct from the catch below, so an operator or
      // wrapper script can tell object removal did nothing this run.
      process.exitCode = 1;
    }
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
