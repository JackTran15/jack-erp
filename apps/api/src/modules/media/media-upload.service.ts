import { randomUUID } from 'crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Raw, Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from '../rbac/rbac.service';
import { CompleteMediaUploadResponseDto, RequestMediaUploadResponseDto } from './dto/media-upload.response.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { MediaObjectEntity, MediaStatus } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { UPLOAD_TICKET_TTL_SECONDS } from './media.constants';
import { resolveMediaStorageConfig } from './media-storage.config';
import { MediaException } from './media.exception';
import { ObjectStorageService } from './object-storage.service';

const MiB = 1024 * 1024;

/**
 * Cap on rows per (organization, creator) created in the last 24h that never
 * made it to ATTACHED. MinIO shares a disk with Postgres (A-07); nothing else
 * stops a loop of `POST /media/uploads` from filling it before the cleanup
 * job ever runs. Counting `PENDING`/`UPLOADED` alone is not enough: a
 * rejected `complete` moves a row to `DELETED` and frees that slot while its
 * ticket (`content-length-range` up to the declared size) is still valid for
 * up to `UPLOAD_TICKET_TTL_SECONDS` more, so `DELETED` rows count too.
 */
const MAX_UNATTACHED_UPLOADS_PER_DAY = 100;

/**
 * Issues upload tickets and confirms uploads (03-logical-design.md, write
 * flow steps 1 and 3). Permission depends on `ownerType` from the request
 * body, so this checks `RbacService.hasAnyPermission` itself instead of a
 * static `@RequirePermission` on the controller.
 */
@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);

  constructor(
    @InjectRepository(MediaObjectEntity)
    private readonly mediaRepo: Repository<MediaObjectEntity>,
    private readonly storage: ObjectStorageService,
    private readonly rbac: RbacService,
    private readonly config: ConfigService,
  ) {}

  async requestUpload(dto: CreateMediaUploadDto, actor: ActorContext): Promise<RequestMediaUploadResponseDto> {
    const policy = MEDIA_OWNER_POLICIES[dto.ownerType];

    const allowed = await this.rbac.hasAnyPermission(actor.userId, actor.organizationId, [
      ...policy.writePermissions,
    ]);
    if (!allowed) {
      this.logger.warn(
        `media.upload.rejected organizationId=${actor.organizationId} ownerType=${dto.ownerType} reason=forbidden`,
      );
      throw new ForbiddenException(`Missing required permission for ownerType "${dto.ownerType}"`);
    }

    if (!policy.contentTypes.includes(dto.contentType)) {
      this.logger.warn(
        `media.upload.rejected organizationId=${actor.organizationId} ownerType=${dto.ownerType} reason=type_not_allowed`,
      );
      throw new MediaException(
        400,
        'MEDIA_TYPE_NOT_ALLOWED',
        `Content type is not allowed for ownerType "${dto.ownerType}"`,
      );
    }

    if (dto.size > policy.maxBytes) {
      this.logger.warn(
        `media.upload.rejected organizationId=${actor.organizationId} ownerType=${dto.ownerType} reason=too_large`,
      );
      throw new MediaException(
        400,
        'MEDIA_TOO_LARGE',
        `File exceeds the ${policy.maxBytes / MiB}MB limit for ownerType "${dto.ownerType}"`,
      );
    }

    // DB clock (not `new Date()`), to match `MediaCleanupJob`'s window and
    // avoid this API instance's clock skewing the count.
    const unattachedCount = await this.mediaRepo.count({
      where: {
        organizationId: actor.organizationId,
        createdBy: actor.userId,
        status: Not(MediaStatus.ATTACHED),
        createdAt: Raw((alias) => `${alias} >= now() - interval '24 hours'`),
      },
    });
    if (unattachedCount >= MAX_UNATTACHED_UPLOADS_PER_DAY) {
      this.logger.warn(
        `media.upload.rejected organizationId=${actor.organizationId} ownerType=${dto.ownerType} reason=quota_exceeded`,
      );
      throw new MediaException(
        429,
        'MEDIA_QUOTA_EXCEEDED',
        'Too many unattached uploads by this user; save or discard pending files and try again later',
      );
    }

    const cfg = resolveMediaStorageConfig(this.config);
    if (!cfg) {
      this.logger.warn(
        `media.upload.rejected organizationId=${actor.organizationId} ownerType=${dto.ownerType} reason=storage_unavailable`,
      );
      throw new MediaException(503, 'STORAGE_UNAVAILABLE', 'Media storage is not configured');
    }
    const bucket = policy.bucket === 'public' ? cfg.bucketPublic : cfg.bucketPrivate;

    const mediaId = randomUUID();
    const objectKey = `org/${actor.organizationId}/${dto.ownerType.toLowerCase()}/${mediaId}`;
    const requestedAt = Date.now();

    // The declared size, not the policy limit, bounds `content-length-range`:
    // otherwise a ticket for a small declared size could still be replayed
    // (before `complete` deletes it) to push up to the policy's full limit.
    const upload = await this.storage.createUploadPolicy(
      bucket,
      objectKey,
      dto.contentType,
      dto.size,
      UPLOAD_TICKET_TTL_SECONDS,
    );

    const media = this.mediaRepo.create({
      id: mediaId,
      organizationId: actor.organizationId,
      ownerType: dto.ownerType,
      ownerId: null,
      status: MediaStatus.PENDING,
      bucket,
      objectKey,
      fileName: dto.fileName,
      contentType: dto.contentType,
      sizeBytes: dto.size,
      sortOrder: 0,
      createdBy: actor.userId,
    });
    await this.mediaRepo.save(media);

    this.logger.log(
      `media.upload.requested organizationId=${actor.organizationId} mediaId=${mediaId} ownerType=${dto.ownerType}`,
    );

    return {
      mediaId,
      upload,
      expiresAt: new Date(requestedAt + UPLOAD_TICKET_TTL_SECONDS * 1000).toISOString(),
    };
  }

  async completeUpload(id: string, actor: ActorContext): Promise<CompleteMediaUploadResponseDto> {
    const media = await this.mediaRepo.findOne({
      where: { id, organizationId: actor.organizationId, createdBy: actor.userId },
    });
    if (!media) {
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    if (media.status === MediaStatus.UPLOADED) {
      return this.toCompleteResponse(media);
    }
    if (media.status === MediaStatus.ATTACHED || media.status === MediaStatus.DELETED) {
      throw new MediaException(409, 'MEDIA_STATE_CONFLICT', `Media is already ${media.status.toLowerCase()}`);
    }

    const head = await this.storage.headObject(media.bucket, media.objectKey);
    const reason = !head
      ? 'object_missing'
      : head.contentLength !== media.sizeBytes
        ? 'size_mismatch'
        : head.contentType !== media.contentType
          ? 'type_mismatch'
          : null;

    // Guard every transition on `status = PENDING` still holding at write time:
    // `syncOwner` (T-01-05) can attach this row between the `findOne` above and
    // here, and an unconditional `save()` of the stale in-memory entity would
    // stomp that attach back to UPLOADED/DELETED with `owner_id` lost (ADR-05).
    const pendingGuard = {
      id: media.id,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
      status: MediaStatus.PENDING,
    };

    if (reason) {
      const { affected } = await this.mediaRepo.update(pendingGuard, {
        status: MediaStatus.DELETED,
        deletedAt: new Date(),
      });
      if (affected === 0) {
        return this.answerAfterRace(media.id, actor);
      }

      if (head) {
        // Best-effort delete, and never stamp `object_removed_at` here even
        // on success (ADR-05 invariant): the ticket signed for this key is
        // still valid for up to `UPLOAD_TICKET_TTL_SECONDS` more, so its
        // holder could still re-POST and land a new object at this exact key
        // before it expires. Only `MediaCleanupJob`, which waits out that
        // window, may claim the key is finally clear. A failed delete here
        // is logged and left for the job to retry.
        try {
          await this.storage.deleteObject(media.bucket, media.objectKey);
        } catch (err) {
          this.logger.error(
            `media.upload.rejected organizationId=${actor.organizationId} mediaId=${media.id} ownerType=${media.ownerType} reason=delete_object_failed`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }

      this.logger.warn(
        `media.upload.rejected organizationId=${actor.organizationId} mediaId=${media.id} ownerType=${media.ownerType} reason=${reason}`,
      );
      throw new MediaException(400, 'MEDIA_INVALID', 'Uploaded object does not match the declared upload ticket');
    }

    const { affected } = await this.mediaRepo.update(pendingGuard, { status: MediaStatus.UPLOADED });
    if (affected === 0) {
      return this.answerAfterRace(media.id, actor);
    }

    this.logger.log(
      `media.upload.completed organizationId=${actor.organizationId} mediaId=${media.id} ownerType=${media.ownerType}`,
    );

    return this.toCompleteResponse({ ...media, status: MediaStatus.UPLOADED });
  }

  /** Re-reads the row after a conditional update found it no longer PENDING and answers from what it now is. */
  private async answerAfterRace(id: string, actor: ActorContext): Promise<CompleteMediaUploadResponseDto> {
    const current = await this.mediaRepo.findOne({
      where: { id, organizationId: actor.organizationId, createdBy: actor.userId },
    });
    if (current?.status === MediaStatus.UPLOADED) {
      return this.toCompleteResponse(current);
    }
    throw new MediaException(409, 'MEDIA_STATE_CONFLICT', 'Media state changed while confirming the upload');
  }

  private toCompleteResponse(media: MediaObjectEntity): CompleteMediaUploadResponseDto {
    return {
      mediaId: media.id,
      status: media.status,
      fileName: media.fileName,
      contentType: media.contentType,
      size: media.sizeBytes,
    };
  }
}
