import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from '../rbac/rbac.service';
import { GetMediaDownloadUrlResponseDto } from './dto/media-download.response.dto';
import { MediaObjectEntity, MediaStatus } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { resolveMediaStorageConfig } from './media-storage.config';
import { MediaException } from './media.exception';
import { MediaOwnerReaderRegistry } from './media-owner-reader.registry';
import { ATTACHMENT_URL_EXPIRES_SEC, MediaQueryService, toMediaSummary } from './media-query.service';

/**
 * `GET /media/:id/download-url` (ADR-06, 03-logical-design.md > Contracts).
 * Visibility is decided by `policy.bucket`, never by an empty
 * `readPermissions` array (`RbacService.hasAnyPermission` already denies an
 * empty key list, but a future "empty = skip the check" change to that method
 * would otherwise leak every public-looking-by-accident private owner type —
 * security review T-01-02, 2026-09-13).
 */
@Injectable()
export class MediaDownloadService {
  private readonly logger = new Logger(MediaDownloadService.name);

  constructor(
    @InjectRepository(MediaObjectEntity)
    private readonly mediaRepo: Repository<MediaObjectEntity>,
    private readonly mediaQuery: MediaQueryService,
    private readonly rbac: RbacService,
    private readonly readers: MediaOwnerReaderRegistry,
    private readonly config: ConfigService,
  ) {}

  async getDownloadUrl(id: string, actor: ActorContext): Promise<GetMediaDownloadUrlResponseDto> {
    // A non-UUID id can never match a row; skip the query rather than let
    // Postgres reject the uuid cast and turn a routine 404 into a 500 (same
    // rule `MediaLinkService` applies to ids from a request body).
    if (!isUUID(id)) {
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    const media = await this.mediaRepo.findOne({
      where: {
        id: id.toLowerCase(),
        organizationId: actor.organizationId,
        status: MediaStatus.ATTACHED,
      },
    });
    if (!media) {
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    const policy = MEDIA_OWNER_POLICIES[media.ownerType];
    const summary = toMediaSummary(media);

    if (policy.bucket === 'public') {
      if (!resolveMediaStorageConfig(this.config)) {
        throw new MediaException(503, 'STORAGE_UNAVAILABLE', 'Media storage is not configured');
      }
      const url = this.mediaQuery.publicUrlFor(summary);
      if (!url) {
        throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
      }
      return { url, expiresAt: null };
    }

    const allowed = await this.rbac.hasAnyPermission(actor.userId, actor.organizationId, [
      ...policy.readPermissions,
    ]);
    if (!allowed) {
      throw new ForbiddenException('Missing required permission to read this media');
    }

    const reader = this.readers.get(media.ownerType);
    if (!reader) {
      // Never log the object key here: this line exists precisely to catch a
      // missing registration in tests before it ever reaches production, and
      // it must not become a second place that leaks storage paths.
      this.logger.warn(
        `media.download.noReader organizationId=${actor.organizationId} mediaId=${media.id} ownerType=${media.ownerType}`,
      );
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    // No DB constraint stops an ATTACHED row from having a null owner_id, and
    // TypeORM's `where` silently ignores a null value — a findOne-based
    // reader would then match any document for this ownerType instead of
    // none. Fail closed before ever calling the reader.
    if (!media.ownerId) {
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    const canRead = await reader(media.ownerId, actor);
    if (!canRead) {
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    const url = await this.mediaQuery.signReadUrl(summary, actor.organizationId, 'attachment');
    return { url, expiresAt: new Date(Date.now() + ATTACHMENT_URL_EXPIRES_SEC * 1000).toISOString() };
  }
}
