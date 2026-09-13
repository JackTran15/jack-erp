import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager, Raw, Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { MediaObjectEntity, MediaOwnerType, MediaStatus } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { UPLOAD_TICKET_GRACE_SECONDS, UPLOAD_TICKET_TTL_SECONDS } from './media.constants';
import { MediaException } from './media.exception';
import { ObjectStorageService } from './object-storage.service';

/**
 * Write side of the media domain model (03-logical-design.md > Approach >
 * write flow, step 4). `syncOwner` is the only path that moves media
 * into/out of `ATTACHED`; the calling business service has already checked
 * its own permission and document-state rules before reaching here (A-26) —
 * media itself carries no owner-state rules.
 */
@Injectable()
export class MediaLinkService {
  private readonly logger = new Logger(MediaLinkService.name);

  constructor(
    @InjectRepository(MediaObjectEntity)
    private readonly mediaRepo: Repository<MediaObjectEntity>,
    private readonly dataSource: DataSource,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  /**
   * A caller-supplied `manager` must belong to a transaction the caller has
   * already opened and will commit/rollback itself — this method never
   * commits it, and never deletes storage objects in that case (ADR-05: the
   * cleanup job removes them later). That transaction must run at READ
   * COMMITTED (Postgres's default) or SERIALIZABLE, not REPEATABLE READ: the
   * lost-update protection in `applySync` depends on the "currently attached"
   * read taking a fresh snapshot after the advisory lock is granted, which
   * REPEATABLE READ's snapshot-at-transaction-start would defeat.
   */
  async syncOwner(
    ownerType: MediaOwnerType,
    ownerId: string,
    ids: string[] | undefined,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<string[]> {
    let normalizedIds = ids;
    if (ids !== undefined) {
      if (!Array.isArray(ids)) {
        throw new BadRequestException('ids must be an array of media ids');
      }
      for (const id of ids) {
        if (!isUUID(id)) {
          throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
        }
      }
      // Postgres uuid columns compare and print case-insensitively; a media
      // id echoed back in a different case than it was stored (or than
      // `row.id` comes back as) must still match the in-memory lookup below.
      normalizedIds = ids.map((id) => id.toLowerCase());
    }
    return this.sync(
      ownerType,
      ownerId.toLowerCase(),
      normalizedIds,
      actor.organizationId,
      actor.userId,
      manager,
    );
  }

  /**
   * Same manager/isolation-level constraints as {@link syncOwner} — see its
   * doc comment.
   */
  async detachAll(
    ownerType: MediaOwnerType,
    ownerId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.sync(ownerType, ownerId.toLowerCase(), [], organizationId, null, manager);
  }

  private async sync(
    ownerType: MediaOwnerType,
    ownerId: string,
    ids: string[] | undefined,
    organizationId: string,
    actorUserId: string | null,
    manager?: EntityManager,
  ): Promise<string[]> {
    if (ids === undefined) {
      return this.listAttachedIds(ownerType, ownerId, organizationId, manager);
    }

    const uniqueIds = Array.from(new Set(ids));
    const maxPerOwner = MEDIA_OWNER_POLICIES[ownerType].maxPerOwner;
    if (uniqueIds.length > maxPerOwner) {
      throw new MediaException(
        400,
        'MEDIA_LIMIT_EXCEEDED',
        `${ownerType} allows at most ${maxPerOwner} media object(s), got ${uniqueIds.length}`,
      );
    }

    if (manager) {
      // Caller's own transaction: only mark rows, never touch storage — the
      // cleanup job removes the object later (ADR-05).
      await this.applySync(manager, ownerType, ownerId, organizationId, actorUserId, uniqueIds);
      return uniqueIds;
    }

    const removedRows = await this.dataSource.transaction((trxManager) =>
      this.applySync(trxManager, ownerType, ownerId, organizationId, actorUserId, uniqueIds),
    );
    await this.cleanupRemovedObjects(removedRows, organizationId);
    return uniqueIds;
  }

  private async listAttachedIds(
    ownerType: MediaOwnerType,
    ownerId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const repo = manager ? manager.getRepository(MediaObjectEntity) : this.mediaRepo;
    const rows = await repo.find({
      where: { organizationId, ownerType, ownerId, status: MediaStatus.ATTACHED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => row.id);
  }

  /**
   * First takes a transaction-scoped Postgres advisory lock keyed on
   * `(organizationId, ownerType, ownerId)`, before any read. Without it, two
   * concurrent calls for the *same* owner can deadlock on the row locks below
   * (each holds the row(s) the other wants, in a different order depending on
   * which ids the request contains) or lose an update (both read the
   * "currently attached" set before either commits, so the second commit
   * silently overwrites the first's result and `maxPerOwner` is no longer
   * enforced). The advisory lock forces such calls to run one at a time.
   *
   * The two `SELECT ... FOR UPDATE` row locks stay: they are what stops the
   * same media row being attached to two *different* owners at once, which
   * the per-owner advisory lock above does not cover.
   */
  private async applySync(
    manager: EntityManager,
    ownerType: MediaOwnerType,
    ownerId: string,
    organizationId: string,
    actorUserId: string | null,
    uniqueIds: string[],
  ): Promise<MediaObjectEntity[]> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `media_objects:${organizationId}:${ownerType}:${ownerId}`,
    ]);

    const repo = manager.getRepository(MediaObjectEntity);

    const requestedRows = uniqueIds.length
      ? await repo
          .createQueryBuilder('m')
          .setLock('pessimistic_write')
          .where('m.id IN (:...ids)', { ids: uniqueIds })
          .andWhere('m.organizationId = :organizationId', { organizationId })
          .orderBy('m.id', 'ASC')
          .getMany()
      : [];
    const byId = new Map(requestedRows.map((row) => [row.id, row]));

    for (const id of uniqueIds) {
      const row = byId.get(id);
      if (!row || row.ownerType !== ownerType) {
        throw new MediaException(404, 'MEDIA_NOT_FOUND', `Media ${id} not found`);
      }
      if (row.status === MediaStatus.UPLOADED) {
        if (row.createdBy !== actorUserId) {
          throw new MediaException(404, 'MEDIA_NOT_FOUND', `Media ${id} not found`);
        }
        continue;
      }
      if (row.status === MediaStatus.ATTACHED) {
        if (row.ownerId !== ownerId) {
          throw new MediaException(
            409,
            'MEDIA_STATE_CONFLICT',
            `Media ${id} is attached to a different owner`,
          );
        }
        continue;
      }
      throw new MediaException(409, 'MEDIA_STATE_CONFLICT', `Media ${id} is ${row.status}`);
    }

    const currentlyAttached = await repo
      .createQueryBuilder('m')
      .setLock('pessimistic_write')
      .where('m.organizationId = :organizationId', { organizationId })
      .andWhere('m.ownerType = :ownerType', { ownerType })
      .andWhere('m.ownerId = :ownerId', { ownerId })
      .andWhere('m.status = :status', { status: MediaStatus.ATTACHED })
      .orderBy('m.id', 'ASC')
      .getMany();

    const keepIds = new Set(uniqueIds);
    const now = new Date();

    const toRemove = currentlyAttached.filter((row) => !keepIds.has(row.id));
    for (const row of toRemove) {
      row.status = MediaStatus.DELETED;
      row.deletedAt = now;
    }
    if (toRemove.length) {
      await repo.save(toRemove);
    }

    // A row already ATTACHED to this owner only has its sort_order touched
    // (and only saved when the position actually changed) — resubmitting an
    // unchanged list must not disturb attached_at or trigger a write.
    const toAttach: MediaObjectEntity[] = [];
    uniqueIds.forEach((id, index) => {
      const row = byId.get(id)!;
      if (row.status === MediaStatus.UPLOADED) {
        row.ownerId = ownerId;
        row.status = MediaStatus.ATTACHED;
        row.attachedAt = now;
        row.sortOrder = index;
        toAttach.push(row);
      } else if (row.sortOrder !== index) {
        row.sortOrder = index;
        toAttach.push(row);
      }
    });
    if (toAttach.length) {
      await repo.save(toAttach);
    }

    return toRemove;
  }

  /**
   * ADR-05 invariant: `object_removed_at` may only be stamped once the row's
   * own upload ticket has expired. A row detached (or never attached) inside
   * the ticket's `UPLOAD_TICKET_TTL_SECONDS` window can still receive a fresh
   * POST at the same object key from whoever was holding that ticket; an
   * early stamp here would make cleanup step 2 skip that key forever
   * (`objectRemovedAt IS NULL` is the only thing step 2 looks for).
   *
   * The age comparison is the `WHERE` of the `UPDATE` itself, evaluated by
   * Postgres's clock against its own `created_at` — comparing this app
   * server's `Date.now()` against a DB-set timestamp would let the two
   * clocks' skew push the stamp either too early or too late. A row still
   * inside the window simply updates zero rows and stays `objectRemovedAt:
   * null` for `MediaCleanupJob` to re-check later (deleting again is a
   * no-op).
   */
  private async cleanupRemovedObjects(
    rows: MediaObjectEntity[],
    organizationId: string,
  ): Promise<void> {
    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          await this.objectStorage.deleteObject(row.bucket, row.objectKey);
          await this.mediaRepo.update(
            {
              id: row.id,
              organizationId,
              createdAt: Raw(
                (alias) =>
                  `${alias} < now() - interval '${UPLOAD_TICKET_TTL_SECONDS + UPLOAD_TICKET_GRACE_SECONDS} seconds'`,
              ),
            },
            { objectRemovedAt: () => 'now()' },
          );
          this.logger.log(
            `media.detached mediaId=${row.id} ownerType=${row.ownerType} organizationId=${organizationId}`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `media.detached mediaId=${row.id} ownerType=${row.ownerType} organizationId=${organizationId} error=${message}`,
          );
        }
      }),
    );
  }
}
