import { BadRequestException, Logger } from '@nestjs/common';
import { MediaLinkService } from './media-link.service';
import { MediaObjectEntity, MediaOwnerType, MediaStatus } from './media-object.entity';
import { UPLOAD_TICKET_GRACE_SECONDS, UPLOAD_TICKET_TTL_SECONDS } from './media.constants';
import { MediaException } from './media.exception';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

const ORG_1 = 'org-1';
const OWNER_1 = 'owner-1';
const OWNER_2 = 'owner-2';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';
const ID_X = '44444444-4444-4444-8444-444444444444';
const ID_Y = '55555555-5555-4555-8555-555555555555';
const ID_OTHER_ORG = '66666666-6666-4666-8666-666666666666';
const ID_DEFAULT = '77777777-7777-4777-8777-777777777777';

type MockQueryBuilder = Record<string, jest.Mock>;

function makeQueryBuilder(): MockQueryBuilder {
  return {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
}

/**
 * The org filter is the first condition on the requested-ids query (`.where`)
 * but a later condition on the currently-attached query (`.andWhere`) — check
 * both so the assertion does not depend on which builder method carried it.
 */
function expectOrgFilter(qb: MockQueryBuilder, organizationId = ORG_1) {
  const calls = [...qb.where.mock.calls, ...qb.andWhere.mock.calls];
  expect(calls).toContainEqual(['m.organizationId = :organizationId', { organizationId }]);
}

function makeRow(overrides: Partial<MediaObjectEntity>): MediaObjectEntity {
  return {
    id: ID_DEFAULT,
    organizationId: ORG_1,
    ownerType: MediaOwnerType.GOODS_RECEIPT,
    ownerId: null,
    status: MediaStatus.UPLOADED,
    bucket: 'private-bucket',
    objectKey: `org/${ORG_1}/goods_receipt/${ID_DEFAULT}`,
    fileName: 'a.png',
    contentType: 'image/png',
    sizeBytes: 100,
    sortOrder: 0,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    attachedAt: null,
    deletedAt: null,
    objectRemovedAt: null,
    ...overrides,
  } as MediaObjectEntity;
}

describe('MediaLinkService', () => {
  let service: MediaLinkService;
  let mediaRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let objectStorage: Record<string, jest.Mock>;
  let trxRepo: { createQueryBuilder: jest.Mock; save: jest.Mock };
  let trxManager: { getRepository: jest.Mock; query: jest.Mock };

  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: ORG_1,
    roles: [],
  };

  /** Queues the query builders `applySync` will receive, one per `createQueryBuilder()` call, in order. */
  function queueQueryBuilders(...qbs: MockQueryBuilder[]) {
    qbs.forEach((qb) => trxRepo.createQueryBuilder.mockImplementationOnce(() => qb));
  }

  beforeEach(() => {
    trxRepo = {
      createQueryBuilder: jest.fn(),
      save: jest.fn().mockImplementation((rows) => Promise.resolve(rows)),
    };

    trxManager = {
      getRepository: jest.fn().mockReturnValue(trxRepo),
      query: jest.fn().mockResolvedValue(undefined),
    };

    mediaRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(trxManager)),
    };

    objectStorage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    service = new MediaLinkService(mediaRepo as any, dataSource as any, objectStorage as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ids === undefined', () => {
    it('leaves everything untouched and returns the attached list in sort_order, id tie-break', async () => {
      mediaRepo.find.mockResolvedValue([
        makeRow({ id: ID_B, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 0 }),
        makeRow({ id: ID_A, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 1 }),
      ]);

      const result = await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, undefined, actor);

      expect(result).toEqual([ID_B, ID_A]);
      expect(mediaRepo.find).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_1,
          ownerType: MediaOwnerType.GOODS_RECEIPT,
          ownerId: OWNER_1,
          status: MediaStatus.ATTACHED,
        },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(trxRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects null with 400, without touching the database', async () => {
      await expect(
        service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, null as any, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a plain string with 400, without touching the database', async () => {
      await expect(
        service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, 'not-an-array' as any, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID array entry with 404, without touching the database, and without echoing it back', async () => {
      await expect(
        service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, ['not-a-uuid'], actor),
      ).rejects.toMatchObject({
        code: 'MEDIA_NOT_FOUND',
        message: 'Media not found',
      } as Partial<MediaException>);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(trxManager.query).not.toHaveBeenCalled();
      expect(trxRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  it('a media id from another organization behaves like not found: 404, nothing changed', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([]); // org filter excludes the row entirely
    queueQueryBuilders(idQb);

    await expect(
      service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_OTHER_ORG], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' } as Partial<MediaException>);

    expectOrgFilter(idQb);
    expect(trxRepo.save).not.toHaveBeenCalled();
  });

  it('an id already attached to a different owner conflicts: 409', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([makeRow({ id: ID_A, status: MediaStatus.ATTACHED, ownerId: OWNER_2 })]);
    queueQueryBuilders(idQb);

    await expect(
      service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_STATE_CONFLICT' } as Partial<MediaException>);

    expect(trxRepo.save).not.toHaveBeenCalled();
  });

  it('a PENDING media conflicts: 409', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([makeRow({ id: ID_A, status: MediaStatus.PENDING })]);
    queueQueryBuilders(idQb);

    await expect(
      service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_STATE_CONFLICT' } as Partial<MediaException>);
  });

  it('a DELETED media conflicts: 409', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([makeRow({ id: ID_A, status: MediaStatus.DELETED })]);
    queueQueryBuilders(idQb);

    await expect(
      service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_STATE_CONFLICT' } as Partial<MediaException>);
  });

  it('wrong owner_type on an otherwise matching row is treated as not found', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([
      makeRow({ id: ID_A, ownerType: MediaOwnerType.CASH_RECEIPT, status: MediaStatus.UPLOADED }),
    ]);
    queueQueryBuilders(idQb);

    await expect(
      service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' } as Partial<MediaException>);
  });

  it('an UPLOADED media not created by this actor is treated as not found', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([makeRow({ id: ID_A, status: MediaStatus.UPLOADED, createdBy: 'someone-else' })]);
    queueQueryBuilders(idQb);

    await expect(
      service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' } as Partial<MediaException>);
  });

  it('exceeding maxPerOwner throws MEDIA_LIMIT_EXCEEDED before touching the database', async () => {
    await expect(
      service.syncOwner(MediaOwnerType.EMPLOYEE_PROFILE, OWNER_1, [ID_A, ID_B], actor),
    ).rejects.toMatchObject({ code: 'MEDIA_LIMIT_EXCEEDED' } as Partial<MediaException>);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('deduplicates before checking maxPerOwner: a repeated id on a 1-slot owner still succeeds', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([
      makeRow({
        id: ID_A,
        ownerType: MediaOwnerType.EMPLOYEE_PROFILE,
        status: MediaStatus.UPLOADED,
        createdBy: 'user-1',
      }),
    ]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([]);
    queueQueryBuilders(idQb, attachedQb);

    const result = await service.syncOwner(
      MediaOwnerType.EMPLOYEE_PROFILE,
      OWNER_1,
      [ID_A, ID_A],
      actor,
    );

    expect(result).toEqual([ID_A]);
  });

  it('returns ids in input order and moves a dropped id to DELETED', async () => {
    const rowB = makeRow({ id: ID_B, status: MediaStatus.UPLOADED, createdBy: 'user-1' });
    const rowA = makeRow({ id: ID_A, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 3 });
    const rowC = makeRow({ id: ID_C, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 5 });

    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([rowB, rowA]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowA, rowC]);
    queueQueryBuilders(idQb, attachedQb);

    const result = await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_B, ID_A], actor);

    expect(result).toEqual([ID_B, ID_A]);
    expectOrgFilter(idQb);
    expectOrgFilter(attachedQb);
    expect(idQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(attachedQb.setLock).toHaveBeenCalledWith('pessimistic_write');

    const [removedCall, attachedCall] = trxRepo.save.mock.calls;
    expect(removedCall[0]).toEqual([expect.objectContaining({ id: ID_C, status: MediaStatus.DELETED })]);
    expect(rowC.deletedAt).toBeInstanceOf(Date);

    expect(attachedCall[0]).toEqual([
      expect.objectContaining({ id: ID_B, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 0 }),
      expect.objectContaining({ id: ID_A, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 1 }),
    ]);
  });

  it('resubmitting an already-attached row in the same position touches nothing', async () => {
    const fixedAttachedAt = new Date('2024-01-01T00:00:00Z');
    const rowA = makeRow({
      id: ID_A,
      status: MediaStatus.ATTACHED,
      ownerId: OWNER_1,
      sortOrder: 0,
      attachedAt: fixedAttachedAt,
    });

    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([rowA]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowA]);
    queueQueryBuilders(idQb, attachedQb);

    const result = await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor);

    expect(result).toEqual([ID_A]);
    expect(rowA.attachedAt).toBe(fixedAttachedAt);
    expect(trxRepo.save).not.toHaveBeenCalled();
  });

  it('resubmitting an already-attached row in a new position updates only sort_order', async () => {
    const fixedAttachedAt = new Date('2024-01-01T00:00:00Z');
    const rowA = makeRow({
      id: ID_A,
      status: MediaStatus.ATTACHED,
      ownerId: OWNER_1,
      sortOrder: 3,
      attachedAt: fixedAttachedAt,
    });

    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([rowA]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowA]);
    queueQueryBuilders(idQb, attachedQb);

    await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor);

    expect(rowA.sortOrder).toBe(0);
    expect(rowA.attachedAt).toBe(fixedAttachedAt);
    expect(trxRepo.save).toHaveBeenCalledTimes(1);
    expect(trxRepo.save).toHaveBeenCalledWith([expect.objectContaining({ id: ID_A, sortOrder: 0 })]);
  });

  it('takes a per-owner advisory lock before any row lock', async () => {
    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([makeRow({ id: ID_A, status: MediaStatus.UPLOADED, createdBy: 'user-1' })]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([]);
    queueQueryBuilders(idQb, attachedQb);

    await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [ID_A], actor);

    expect(trxManager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `media_objects:${ORG_1}:${MediaOwnerType.GOODS_RECEIPT}:${OWNER_1}`,
    ]);
    const lockOrder = trxManager.query.mock.invocationCallOrder[0];
    const queryBuilderOrder = trxRepo.createQueryBuilder.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(queryBuilderOrder);
  });

  it('lowercases ownerId at the entry so an uppercase-cased caller matches its own attachments', async () => {
    // Postgres stores/prints uuid columns lowercase regardless of input case,
    // so a row's ownerId always comes back lowercase — a caller passing the
    // same owner in a different case must still match it, and the advisory
    // lock key for both callers must be identical.
    const upperOwner = OWNER_1.toUpperCase();
    const rowA = makeRow({ id: ID_A, status: MediaStatus.ATTACHED, ownerId: OWNER_1, sortOrder: 0 });

    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([rowA]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowA]);
    queueQueryBuilders(idQb, attachedQb);

    const result = await service.syncOwner(
      MediaOwnerType.GOODS_RECEIPT,
      upperOwner,
      [ID_A.toUpperCase()],
      actor,
    );

    expect(result).toEqual([ID_A]);
    expect(trxRepo.save).not.toHaveBeenCalled();
    expect(trxManager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `media_objects:${ORG_1}:${MediaOwnerType.GOODS_RECEIPT}:${OWNER_1}`,
    ]);
  });

  it('detachAll also takes the advisory lock before any row lock', async () => {
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1 });
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY]);
    queueQueryBuilders(attachedQb);

    await service.detachAll(MediaOwnerType.GOODS_RECEIPT, OWNER_1, ORG_1);

    expect(trxManager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `media_objects:${ORG_1}:${MediaOwnerType.GOODS_RECEIPT}:${OWNER_1}`,
    ]);
    const lockOrder = trxManager.query.mock.invocationCallOrder[0];
    const queryBuilderOrder = trxRepo.createQueryBuilder.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(queryBuilderOrder);
  });

  it('with a caller-supplied manager, rows are only marked — deleteObject is never called', async () => {
    const callerRepo = { createQueryBuilder: jest.fn(), save: jest.fn().mockImplementation((rows) => Promise.resolve(rows)) };
    const callerManager = {
      getRepository: jest.fn().mockReturnValue(callerRepo),
      query: jest.fn().mockResolvedValue(undefined),
    } as any;

    const rowX = makeRow({ id: ID_X, status: MediaStatus.UPLOADED, createdBy: 'user-1' });
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1 });

    const idQb = makeQueryBuilder();
    idQb.getMany.mockResolvedValueOnce([rowX]);
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY]);
    callerRepo.createQueryBuilder.mockImplementationOnce(() => idQb).mockImplementationOnce(() => attachedQb);

    const result = await service.syncOwner(
      MediaOwnerType.GOODS_RECEIPT,
      OWNER_1,
      [ID_X],
      actor,
      callerManager,
    );

    expect(result).toEqual([ID_X]);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(mediaRepo.update).not.toHaveBeenCalled();
    expect(callerRepo.save).toHaveBeenCalledTimes(2);
    expect(rowY.status).toBe(MediaStatus.DELETED);
    expect(rowY.deletedAt).toBeInstanceOf(Date);
    expect(callerManager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `media_objects:${ORG_1}:${MediaOwnerType.GOODS_RECEIPT}:${OWNER_1}`,
    ]);
    expect(trxManager.query).not.toHaveBeenCalled();
  });

  it('deletes the object then stamps object_removed_at with a DB-clock-guarded update (ADR-05)', async () => {
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1 });
    // ids is empty, so applySync skips the requested-ids lookup entirely and
    // only queries currently-attached rows.
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY]);
    queueQueryBuilders(attachedQb);

    const result = await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [], actor);

    expect(result).toEqual([]);
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(rowY.bucket, rowY.objectKey);
    expect(mediaRepo.update).toHaveBeenCalledTimes(1);

    // The age gate is the WHERE of this UPDATE, evaluated by Postgres against
    // its own created_at — a row still inside the ticket TTL simply matches
    // zero rows and is left for MediaCleanupJob, so there is no separate JS
    // branch to unit-test for "too young" (ADR-05, no real Postgres here).
    const [criteria, patch] = mediaRepo.update.mock.calls[0];
    expect(criteria.id).toBe(ID_Y);
    expect(criteria.organizationId).toBe(ORG_1);
    expect(criteria.createdAt.getSql('c')).toBe(
      `c < now() - interval '${UPLOAD_TICKET_TTL_SECONDS + UPLOAD_TICKET_GRACE_SECONDS} seconds'`,
    );
    expect(patch.objectRemovedAt()).toBe('now()');
  });

  it('does not call deleteObject while the transaction callback is still running', async () => {
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1 });
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY]);
    queueQueryBuilders(attachedQb);

    let deleteObjectCalledDuringTransaction = false;
    dataSource.transaction.mockImplementation(async (cb) => {
      const result = await cb(trxManager);
      deleteObjectCalledDuringTransaction = objectStorage.deleteObject.mock.calls.length > 0;
      return result;
    });

    await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [], actor);

    expect(deleteObjectCalledDuringTransaction).toBe(false);
    expect(objectStorage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('cleans up removed objects independently: one failure does not block another row', async () => {
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1, bucket: 'b-y', objectKey: 'key-y' });
    const rowC = makeRow({ id: ID_C, status: MediaStatus.ATTACHED, ownerId: OWNER_1, bucket: 'b-c', objectKey: 'key-c' });
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY, rowC]);
    queueQueryBuilders(attachedQb);

    objectStorage.deleteObject.mockImplementation((bucket: string) =>
      bucket === 'b-y' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    );
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const result = await service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [], actor);

    expect(result).toEqual([]);
    expect(objectStorage.deleteObject).toHaveBeenCalledTimes(2);
    expect(mediaRepo.update).toHaveBeenCalledTimes(1);
    expect(mediaRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID_C, organizationId: ORG_1 }),
      expect.objectContaining({ objectRemovedAt: expect.any(Function) }),
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('media.detached'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('logs media.detached with String(err) when the rejection is not an Error', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1 });
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY]);
    queueQueryBuilders(attachedQb);
    objectStorage.deleteObject.mockRejectedValueOnce('boom-string');

    await expect(service.syncOwner(MediaOwnerType.GOODS_RECEIPT, OWNER_1, [], actor)).resolves.toEqual([]);

    expect(mediaRepo.update).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom-string'));
  });

  it('detachAll behaves like syncOwner with an empty array and needs no actor', async () => {
    const rowY = makeRow({ id: ID_Y, status: MediaStatus.ATTACHED, ownerId: OWNER_1 });
    const attachedQb = makeQueryBuilder();
    attachedQb.getMany.mockResolvedValueOnce([rowY]);
    queueQueryBuilders(attachedQb);

    const result = await service.detachAll(MediaOwnerType.GOODS_RECEIPT, OWNER_1, ORG_1);

    expect(result).toEqual([]);
    expect(rowY.status).toBe(MediaStatus.DELETED);
    expectOrgFilter(attachedQb);
  });
});
