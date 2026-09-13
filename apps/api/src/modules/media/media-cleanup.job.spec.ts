import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator, IsNull } from 'typeorm';
import { CLEANUP_BATCH_SIZE, MediaCleanupJob } from './media-cleanup.job';
import { MediaException } from './media.exception';
import { MediaObjectEntity, MediaStatus } from './media-object.entity';
import { ObjectStorageService } from './object-storage.service';

function rowStub(overrides: Partial<MediaObjectEntity> = {}): MediaObjectEntity {
  const id = overrides.id ?? 'media-1';
  return {
    id,
    status: MediaStatus.DELETED,
    objectRemovedAt: null,
    bucket: 'erp-media-private',
    objectKey: `org/org-1/goods_receipt/${id}`,
    ...overrides,
  } as MediaObjectEntity;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

const STEP_1_UPDATE_SQL = `
  UPDATE media_objects
  SET status = 'DELETED', deleted_at = now(), updated_at = now()
  WHERE status IN ($1, $2) AND created_at < now() - interval '24 hours'
  RETURNING id
`;

/**
 * Minimal but real implementation of the `find`/`update` surface the job
 * uses, so the starvation-fix test exercises the actual `where`/`order`/
 * `take`/keyset-cursor semantics instead of a canned mock response.
 */
class InMemoryMediaRepo {
  query = jest.fn().mockResolvedValue([[], 0]);
  find = jest.fn(async (options: { where: Record<string, unknown>; take: number }) => {
    const { where, take } = options;
    let rows = this.rows.filter((r) => r.status === where.status);
    if (where.objectRemovedAt instanceof FindOperator && where.objectRemovedAt.type === 'isNull') {
      rows = rows.filter((r) => r.objectRemovedAt === null);
    }
    if (where.id instanceof FindOperator && where.id.type === 'moreThan') {
      const cursor = where.id.value as string;
      rows = rows.filter((r) => r.id > cursor);
    }
    rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return rows.slice(0, take);
  });
  update = jest.fn(async (id: string) => {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.objectRemovedAt = new Date();
    return { affected: row ? 1 : 0 };
  });

  constructor(private readonly rows: MediaObjectEntity[]) {}
}

describe('MediaCleanupJob', () => {
  let job: MediaCleanupJob;
  let mediaRepo: { query: jest.Mock; find: jest.Mock; update: jest.Mock };
  let storage: { deleteObject: jest.Mock };

  beforeEach(async () => {
    mediaRepo = {
      query: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaCleanupJob,
        { provide: getRepositoryToken(MediaObjectEntity), useValue: mediaRepo },
        { provide: ObjectStorageService, useValue: storage },
      ],
    }).compile();

    job = module.get(MediaCleanupJob);
    jest.spyOn(job['logger'], 'log').mockImplementation();
    jest.spyOn(job['logger'], 'error').mockImplementation();
  });

  describe('step 1 — expiring abandoned uploads', () => {
    it('runs exactly the expected set-based UPDATE, so e.g. a NOT IN typo would fail this test', async () => {
      mediaRepo.query.mockResolvedValue([[{ id: 'a' }, { id: 'b' }], 2]);

      await job.run();

      expect(mediaRepo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mediaRepo.query.mock.calls[0];
      expect(normalizeSql(sql)).toBe(normalizeSql(STEP_1_UPDATE_SQL));
      expect(params).toEqual([MediaStatus.PENDING, MediaStatus.UPLOADED]);
    });

    it('counts the expired rows from the RETURNING result in the summary log', async () => {
      mediaRepo.query.mockResolvedValue([[{ id: 'a' }, { id: 'b' }], 2]);

      await job.run();

      expect(job['logger'].log).toHaveBeenCalledWith(expect.stringContaining('expired=2'));
    });
  });

  describe('step 2 — removing DELETED objects', () => {
    it('only selects DELETED rows missing object_removed_at, ordered by id, never ATTACHED', async () => {
      await job.run();

      expect(mediaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: MediaStatus.DELETED, objectRemovedAt: IsNull() },
          order: { id: 'ASC' },
        }),
      );
    });

    it('deletes the object and stamps object_removed_at with the DB clock for a DELETED row', async () => {
      const row = rowStub();
      mediaRepo.find.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);

      await job.run();

      expect(storage.deleteObject).toHaveBeenCalledWith(row.bucket, row.objectKey);
      expect(mediaRepo.update).toHaveBeenCalledWith(row.id, {
        objectRemovedAt: expect.any(Function),
      });
    });

    it('counts a failed object deletion without blocking the rest of the batch', async () => {
      const rowA = rowStub({ id: 'a' });
      const rowB = rowStub({ id: 'b' });
      mediaRepo.find.mockResolvedValueOnce([rowA, rowB]).mockResolvedValueOnce([]);
      storage.deleteObject
        .mockRejectedValueOnce(new Error('transient S3 error'))
        .mockResolvedValueOnce(undefined);

      await job.run();

      expect(storage.deleteObject).toHaveBeenCalledTimes(2);
      expect(mediaRepo.update).toHaveBeenCalledTimes(1);
      expect(mediaRepo.update).toHaveBeenCalledWith(rowB.id, expect.anything());
      expect(job['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('removed=1 failed=1'),
      );
    });

    it('pages the next batch with a keyset cursor set to the last id of the whole batch, not just its successes', async () => {
      const rowA = rowStub({ id: 'a' });
      const filler = Array.from({ length: CLEANUP_BATCH_SIZE - 2 }, (_, i) =>
        rowStub({ id: `filler-${i}` }),
      );
      const lastRow = rowStub({ id: 'z-last' });
      const fullBatch = [rowA, ...filler, lastRow];
      mediaRepo.find.mockResolvedValueOnce(fullBatch).mockResolvedValueOnce([]);
      // rowA (first in the batch) fails; everything after it, including the
      // last row, succeeds — the cursor must still advance past all of it.
      storage.deleteObject.mockImplementation((_bucket: string, key: string) =>
        key === rowA.objectKey ? Promise.reject(new Error('transient S3 error')) : Promise.resolve(),
      );

      await job.run();

      expect(mediaRepo.find).toHaveBeenCalledTimes(2);
      expect(storage.deleteObject).toHaveBeenCalledTimes(CLEANUP_BATCH_SIZE);
      expect(mediaRepo.update).toHaveBeenCalledTimes(CLEANUP_BATCH_SIZE - 1);

      const secondCallWhere = mediaRepo.find.mock.calls[1][0].where;
      expect(secondCallWhere.id).toBeInstanceOf(FindOperator);
      expect((secondCallWhere.id as FindOperator<string>).value).toBe('z-last');
      expect(job['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining(`removed=${CLEANUP_BATCH_SIZE - 1} failed=1`),
      );
    });

    it('stops object removal cleanly on STORAGE_UNAVAILABLE, without touching later rows, but still reports step 1', async () => {
      mediaRepo.query.mockResolvedValue([[{ id: 'a' }, { id: 'b' }, { id: 'c' }], 3]);
      const rowA = rowStub({ id: 'a' });
      const rowB = rowStub({ id: 'b' });
      mediaRepo.find.mockResolvedValueOnce([rowA, rowB]);
      storage.deleteObject.mockRejectedValueOnce(
        new MediaException(503, 'STORAGE_UNAVAILABLE', 'Object storage is unreachable'),
      );

      const summary = await job.run();

      expect(mediaRepo.find).toHaveBeenCalledTimes(1);
      expect(storage.deleteObject).toHaveBeenCalledTimes(1);
      expect(storage.deleteObject).toHaveBeenCalledWith(rowA.bucket, rowA.objectKey);
      expect(mediaRepo.update).not.toHaveBeenCalled();
      expect(job['logger'].error).toHaveBeenCalledTimes(1);
      expect(summary).toEqual({
        expiredCount: 3,
        removedCount: 0,
        failedCount: 1,
        storageUnavailable: true,
      });
      expect(job['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('expired=3 removed=0 failed=1'),
      );
    });

    it('returns storageUnavailable: false and the counts as a plain summary on a normal run', async () => {
      mediaRepo.query.mockResolvedValue([[], 0]);

      const summary = await job.run();

      expect(summary).toEqual({
        expiredCount: 0,
        removedCount: 0,
        failedCount: 0,
        storageUnavailable: false,
      });
    });

    it('adds the distinct error names of per-object failures to the summary log, never keys or messages', async () => {
      const rowA = rowStub({ id: 'a' });
      const rowB = rowStub({ id: 'b' });
      const rowC = rowStub({ id: 'c' });
      mediaRepo.find.mockResolvedValueOnce([rowA, rowB, rowC]).mockResolvedValueOnce([]);
      const accessDenied = Object.assign(new Error('secret-bearing message for a'), {
        name: 'AccessDenied',
      });
      const noSuchBucket = Object.assign(new Error('secret-bearing message for b'), {
        name: 'NoSuchBucket',
      });
      storage.deleteObject
        .mockRejectedValueOnce(accessDenied)
        .mockRejectedValueOnce(noSuchBucket)
        // Same error name again: must not be duplicated in the log.
        .mockRejectedValueOnce(
          Object.assign(new Error('secret-bearing message for c'), { name: 'AccessDenied' }),
        );

      await job.run();

      const [logLine] = (job['logger'].log as jest.Mock).mock.calls[0];
      expect(logLine).toContain('errors=AccessDenied,NoSuchBucket');
      expect(logLine).not.toContain('secret-bearing');
      expect(logLine).not.toContain(rowA.objectKey);
    });

    it('pages by a keyset cursor on id so a block of permanently-failing rows cannot starve rows behind them', async () => {
      const failing = Array.from({ length: 600 }, (_, i) =>
        rowStub({ id: `f-${String(i).padStart(4, '0')}` }),
      );
      const healthy = Array.from({ length: 200 }, (_, i) =>
        rowStub({ id: `h-${String(i).padStart(4, '0')}` }),
      );
      const fakeRepo = new InMemoryMediaRepo([...failing, ...healthy]);
      storage.deleteObject.mockImplementation((_bucket: string, key: string) =>
        key.includes('/f-') ? Promise.reject(new Error('boom')) : Promise.resolve(),
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MediaCleanupJob,
          { provide: getRepositoryToken(MediaObjectEntity), useValue: fakeRepo },
          { provide: ObjectStorageService, useValue: storage },
        ],
      }).compile();
      const starvedJob = module.get(MediaCleanupJob);
      jest.spyOn(starvedJob['logger'], 'log').mockImplementation();
      jest.spyOn(starvedJob['logger'], 'error').mockImplementation();

      const summary = await starvedJob.run();

      expect(summary.removedCount).toBe(200);
      expect(summary.failedCount).toBe(600);
      expect(fakeRepo.find.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe('summary log', () => {
    it('logs a single media.cleanup line with expired/removed/failed counts', async () => {
      mediaRepo.query.mockResolvedValue([[{ id: 'a' }], 1]);
      const row = rowStub();
      mediaRepo.find.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);

      await job.run();

      expect(job['logger'].log).toHaveBeenCalledTimes(1);
      expect(job['logger'].log).toHaveBeenCalledWith('media.cleanup expired=1 removed=1 failed=0');
    });
  });
});
