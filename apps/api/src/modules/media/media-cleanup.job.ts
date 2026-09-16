import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Raw, Repository } from 'typeorm';
import { affectedRowCount } from '../../common/utils/returning-rows.util';
import { UPLOAD_TICKET_GRACE_SECONDS, UPLOAD_TICKET_TTL_SECONDS } from './media.constants';
import { MediaException } from './media.exception';
import { MediaObjectEntity, MediaStatus } from './media-object.entity';
import { ObjectStorageService } from './object-storage.service';

export const CLEANUP_BATCH_SIZE = 500;

export interface CleanupSummary {
  expiredCount: number;
  removedCount: number;
  failedCount: number;
  storageUnavailable: boolean;
}

interface RemovalOutcome {
  removedCount: number;
  failedCount: number;
  errorNames: string[];
  storageUnavailable: boolean;
}

/** `MediaException` carries a stable `code`; anything else falls back to its `Error.name`. */
function errorName(err: unknown): string {
  if (err instanceof MediaException) return err.code;
  if (err instanceof Error) return err.name;
  return 'UnknownError';
}

/**
 * ADR-05 (03-logical-design.md): removes media a business transaction only
 * marked DELETED, plus expires PENDING/UPLOADED rows abandoned past 24h
 * (A-18). Runs cross-tenant like `OverdueDebtsService`, one hour after it.
 * Never touches ATTACHED rows. One process per deployment (A-18), so a
 * concurrent manual `media:cleanup` run plus the cron firing is harmless:
 * both statements are idempotent and re-deleting an already-removed object
 * is a no-op in S3/MinIO.
 */
@Injectable()
export class MediaCleanupJob {
  private readonly logger = new Logger(MediaCleanupJob.name);

  constructor(
    @InjectRepository(MediaObjectEntity)
    private readonly mediaRepo: Repository<MediaObjectEntity>,
    private readonly storage: ObjectStorageService,
  ) {}

  /** Return value is for `media-cleanup.seed.ts`; `@Cron` itself ignores it. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run(): Promise<CleanupSummary> {
    const expiredCount = await this.expireAbandonedUploads();
    const { removedCount, failedCount, errorNames, storageUnavailable } =
      await this.removeDeletedObjects();
    const errorsSuffix = errorNames.length > 0 ? ` errors=${errorNames.sort().join(',')}` : '';
    this.logger.log(
      `media.cleanup expired=${expiredCount} removed=${removedCount} failed=${failedCount}${errorsSuffix}`,
    );
    return { expiredCount, removedCount, failedCount, storageUnavailable };
  }

  private async expireAbandonedUploads(): Promise<number> {
    const result = await this.mediaRepo.query(
      `UPDATE media_objects
       SET status = 'DELETED', deleted_at = now(), updated_at = now()
       WHERE status IN ($1, $2) AND created_at < now() - interval '24 hours'
       RETURNING id`,
      [MediaStatus.PENDING, MediaStatus.UPLOADED],
    );
    return affectedRowCount(result);
  }

  /**
   * Batches of `CLEANUP_BATCH_SIZE`, paged by a keyset cursor on `id` (not
   * `createdAt`: a `timestamptz` keeps microseconds but a JS `Date` only
   * milliseconds, so a timestamp cursor could re-select its own boundary
   * row). The cursor advances past every row it sees, success or failure, so
   * a permanently-failing row can never fill the window and starve rows
   * behind it — it is simply left for a later run to retry, still DELETED
   * with `object_removed_at` null.
   *
   * Also requires `created_at` to be older than `UPLOAD_TICKET_TTL_SECONDS`
   * plus `UPLOAD_TICKET_GRACE_SECONDS` (ADR-05 invariant, DB clock): a row
   * younger than that still has a live upload ticket for its object key, and
   * a fresh POST could land a new object there right as this deletes the old
   * one. The grace period absorbs skew between this app server's clock and
   * the DB's.
   */
  private async removeDeletedObjects(): Promise<RemovalOutcome> {
    let removedCount = 0;
    let failedCount = 0;
    let lastId: string | undefined;
    const errorNames = new Set<string>();

    for (;;) {
      const rows = await this.mediaRepo.find({
        where: {
          status: MediaStatus.DELETED,
          objectRemovedAt: IsNull(),
          createdAt: Raw(
            (alias) =>
              `${alias} < now() - interval '${UPLOAD_TICKET_TTL_SECONDS + UPLOAD_TICKET_GRACE_SECONDS} seconds'`,
          ),
          ...(lastId !== undefined ? { id: MoreThan(lastId) } : {}),
        },
        order: { id: 'ASC' },
        take: CLEANUP_BATCH_SIZE,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        try {
          await this.storage.deleteObject(row.bucket, row.objectKey);
          await this.mediaRepo.update(row.id, { objectRemovedAt: () => 'now()' });
          removedCount++;
        } catch (err) {
          failedCount++;
          errorNames.add(errorName(err));
          if (err instanceof MediaException && err.code === 'STORAGE_UNAVAILABLE') {
            this.logger.error('media.cleanup storage unavailable, stopping object removal');
            return {
              removedCount,
              failedCount,
              errorNames: [...errorNames],
              storageUnavailable: true,
            };
          }
        }
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < CLEANUP_BATCH_SIZE) break;
    }

    return { removedCount, failedCount, errorNames: [...errorNames], storageUnavailable: false };
  }
}
