import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MediaObjectEntity, MediaOwnerType, MediaStatus } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { ObjectStorageService } from './object-storage.service';
import { resolveMediaStorageConfig, ResolvedMediaStorageConfig } from './media-storage.config';
import { MediaException } from './media.exception';

/**
 * `bucket`, `objectKey` and `ownerType` are server-side only: they exist to
 * call back into `MediaQueryService`/`ObjectStorageService`, never to reach an
 * HTTP response. Callers must copy out the fields they actually return (e.g.
 * `{ id, fileName, url }`) and must never spread a `MediaSummary` into a
 * response body.
 */
export interface MediaSummary {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  sortOrder: number;
  bucket: string;
  objectKey: string;
  ownerType: MediaOwnerType;
}

export interface PublicMedia {
  id: string;
  url: string;
  fileName: string;
}

const INLINE_URL_EXPIRES_SEC = 60 * 60;
export const ATTACHMENT_URL_EXPIRES_SEC = 15 * 60;

/**
 * Content types allowed to render `inline` on the ERP origin. An allow-list,
 * not `startsWith('image/')`: `image/svg+xml` is an image MIME type but an
 * SVG can carry `<script>`, so it must never render inline on this origin
 * (signed URLs are same-origin behind nginx, A-06) — it is signed as
 * `attachment` like any other non-image file.
 */
const INLINE_SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const PUBLIC_OWNER_TYPES = (Object.keys(MEDIA_OWNER_POLICIES) as MediaOwnerType[]).filter(
  (ownerType) => MEDIA_OWNER_POLICIES[ownerType].bucket === 'public',
);
const PUBLIC_OWNER_TYPES_SET = new Set<MediaOwnerType>(PUBLIC_OWNER_TYPES);

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `^org/<organizationId>/(product|item)/<uuid>$` (ADR-04). Anchoring the
 * organization segment to the caller's actual `organizationId` — not just any
 * well-formed UUID — is what stops a key such as
 * `org/o1/product/../../../../erp-media-private/x` (which a URL parser would
 * happily normalize away from the public bucket entirely) from ever reaching
 * `buildPublicUrl`: `..` cannot match the UUID segment, so the whole anchored
 * pattern fails closed instead of silently percent-encoding a traversal.
 */
function buildPublicObjectKeyPattern(organizationId: string): RegExp {
  const ownerTypeAlternation = PUBLIC_OWNER_TYPES.map((type) => type.toLowerCase()).join('|');
  return new RegExp(`^org/${escapeRegExp(organizationId)}/(?:${ownerTypeAlternation})/${UUID_PATTERN}$`, 'i');
}

/**
 * Same shape check as `buildPublicObjectKeyPattern`, for `publicUrlFor`, where
 * no external `organizationId` is available to anchor against — a
 * `MediaSummary` does not carry one. The org segment is only checked for being
 * *a* well-formed UUID here; the organization boundary itself is already
 * enforced by whichever query produced the summary (`listForOwners` /
 * `resolvePublicUrls` both filter by `organizationId`). This still blocks a
 * malformed or traversal-shaped key from ever reaching `buildPublicUrl`.
 */
const PUBLIC_OBJECT_KEY_SHAPE = new RegExp(
  `^org/${UUID_PATTERN}/(?:${PUBLIC_OWNER_TYPES.map((type) => type.toLowerCase()).join('|')})/${UUID_PATTERN}$`,
  'i',
);

/**
 * `^org/<organizationId>/<owner_type>/<uuid>$` anchored at both ends (ADR-04),
 * for private media (`signReadUrl`). A prefix-only check (`startsWith`) still
 * accepts a key like `org/<organizationId>/../<other-org>/<uuid>`: it does
 * start with the right prefix, and whatever comes after is never examined.
 * `..` cannot match `[a-z_]+`, and the extra segments cannot match this
 * pattern's fixed 4-segment shape, so a traversal or segment-injection
 * attempt fails closed instead of merely failing to be caught by chance.
 */
function buildPrivateObjectKeyPattern(organizationId: string): RegExp {
  return new RegExp(`^org/${escapeRegExp(organizationId)}/[a-z_]+/${UUID_PATTERN}$`, 'i');
}

/** Maps a stored row to the read-only shape callers work with. */
export function toMediaSummary(row: MediaObjectEntity): MediaSummary {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.sizeBytes,
    sortOrder: row.sortOrder,
    bucket: row.bucket,
    objectKey: row.objectKey,
    ownerType: row.ownerType,
  };
}

/**
 * `object_key` is a server-generated `org/<organizationId>/<owner_type>/<id>`
 * path (ADR-04). Callers only ever reach this after `objectKey` has already
 * passed the shape check above, so none of its segments should contain `/`,
 * `?` or `#` — split and percent-encode each segment anyway rather than trust
 * that invariant forever: a future owner type or key format change must not
 * silently let a segment inject a query string, fragment, or extra path
 * separator into a public URL.
 */
function encodeObjectKeyPath(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildPublicUrl(baseUrl: string, bucket: string, objectKey: string): string {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, '');
  return `${trimmedBaseUrl}/${encodeURIComponent(bucket)}/${encodeObjectKeyPath(objectKey)}`;
}

/**
 * Read side of the media module (03-logical-design.md > Approach (read
 * flow)). Every method takes a batch of owner ids and issues exactly one
 * query, because every caller (employee list, POS catalog, partner
 * search/detail) renders a page of rows and must not turn into N+1 queries.
 */
@Injectable()
export class MediaQueryService {
  private readonly logger = new Logger(MediaQueryService.name);
  private publicConfigUnavailableWarned = false;

  constructor(
    @InjectRepository(MediaObjectEntity)
    private readonly mediaRepo: Repository<MediaObjectEntity>,
    private readonly config: ConfigService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async listForOwners(
    ownerType: MediaOwnerType,
    ownerIds: string[],
    organizationId: string,
  ): Promise<Map<string, MediaSummary[]>> {
    if (ownerIds.length === 0) return new Map();

    const rows = await this.mediaRepo
      .createQueryBuilder('media')
      .where('media.organizationId = :organizationId', { organizationId })
      .andWhere('media.ownerType = :ownerType', { ownerType })
      .andWhere('media.ownerId = ANY(:ownerIds)', { ownerIds })
      .andWhere('media.status = :status', { status: MediaStatus.ATTACHED })
      .orderBy('media.sortOrder', 'ASC')
      .addOrderBy('media.id', 'ASC')
      .getMany();

    const result = new Map<string, MediaSummary[]>();
    for (const row of rows) {
      if (!row.ownerId) continue;
      const summaries = result.get(row.ownerId) ?? [];
      summaries.push(toMediaSummary(row));
      result.set(row.ownerId, summaries);
    }
    return result;
  }

  /**
   * Public-bucket owner types (`PRODUCT`, `ITEM`) only — filtered in the query
   * itself so a private-bucket owner id can never surface a URL, not by
   * filtering the fetched rows afterwards.
   *
   * Building the URL is pure string concatenation (03-logical-design.md >
   * Approach (read flow)); it never calls storage. Config is resolved
   * *before* querying: an unconfigured environment returns immediately with
   * no DB round trip and no URLs, instead of throwing `STORAGE_UNAVAILABLE` —
   * catalog pages (POS, partner search) that already tolerate a product with
   * zero images should keep rendering without pictures rather than fail
   * outright over a media misconfiguration. Signing an actual read link
   * (`signReadUrl`) still throws, because that path genuinely needs storage to
   * be reachable.
   */
  async resolvePublicUrls(
    ownerIds: string[],
    organizationId: string,
  ): Promise<Map<string, PublicMedia[]>> {
    if (ownerIds.length === 0) return new Map();

    const cfg = this.resolvePublicConfig();
    if (!cfg) return new Map();

    const rows = await this.mediaRepo
      .createQueryBuilder('media')
      .where('media.organizationId = :organizationId', { organizationId })
      .andWhere('media.ownerType = ANY(:ownerTypes)', { ownerTypes: PUBLIC_OWNER_TYPES })
      .andWhere('media.ownerId = ANY(:ownerIds)', { ownerIds })
      .andWhere('media.status = :status', { status: MediaStatus.ATTACHED })
      .orderBy('media.sortOrder', 'ASC')
      .addOrderBy('media.id', 'ASC')
      .getMany();

    const keyPattern = buildPublicObjectKeyPattern(organizationId);
    const result = new Map<string, PublicMedia[]>();
    for (const row of rows) {
      if (!row.ownerId) continue;
      if (!keyPattern.test(row.objectKey)) {
        this.logger.warn(
          `media.publicUrl.invalidObjectKey: skipping media ${row.id} for owner ${row.ownerId} — object_key does not match the expected org/<organizationId>/<ownerType>/<uuid> shape`,
        );
        continue;
      }
      const items = result.get(row.ownerId) ?? [];
      items.push({
        id: row.id,
        url: buildPublicUrl(cfg.publicBaseUrl, cfg.bucketPublic, row.objectKey),
        fileName: row.fileName,
      });
      result.set(row.ownerId, items);
    }
    return result;
  }

  /**
   * Single-item counterpart to `resolvePublicUrls`, for a caller that already
   * holds a `MediaSummary` (e.g. from `listForOwners`) and needs its public
   * URL without a second query. Returns `null` when the owner type is not
   * public, when storage is not configured, or when `objectKey` does not look
   * like a server-generated public key (`PUBLIC_OBJECT_KEY_SHAPE`).
   */
  publicUrlFor(summary: MediaSummary): string | null {
    if (!PUBLIC_OWNER_TYPES_SET.has(summary.ownerType)) return null;

    const cfg = this.resolvePublicConfig();
    if (!cfg) return null;

    if (!PUBLIC_OBJECT_KEY_SHAPE.test(summary.objectKey)) {
      this.logger.warn(
        `media.publicUrl.invalidObjectKey: skipping media ${summary.id} — object_key does not match the expected org/<organizationId>/<ownerType>/<uuid> shape`,
      );
      return null;
    }

    return buildPublicUrl(cfg.publicBaseUrl, cfg.bucketPublic, summary.objectKey);
  }

  /**
   * Presigned GET for private media. Refuses to sign anything that is not
   * actually private-bucket media belonging to `organizationId`: a caller
   * passing a wrong-organization or otherwise mismatched `MediaSummary` gets
   * 404 `MEDIA_NOT_FOUND` — the same as if the media did not exist —
   * and `ObjectStorageService.signGetUrl` is never reached. A voucher PDF/CSV
   * requested as `inline` is signed as `attachment` instead: these must never
   * render inline on the ERP origin. `ObjectStorageService` builds
   * `Content-Disposition` itself (ASCII fallback + `filename*=UTF-8''…`,
   * security review T-01-03, 2026-09-13); this only picks the effective
   * disposition and TTL and forwards the stored original file name.
   */
  async signReadUrl(
    summary: MediaSummary,
    organizationId: string,
    disposition: 'inline' | 'attachment',
  ): Promise<string> {
    const cfg = resolveMediaStorageConfig(this.config);
    if (!cfg) {
      throw new MediaException(503, 'STORAGE_UNAVAILABLE', 'Media storage is not configured');
    }

    if (
      summary.bucket !== cfg.bucketPrivate ||
      !buildPrivateObjectKeyPattern(organizationId).test(summary.objectKey)
    ) {
      throw new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }

    const effectiveDisposition: 'inline' | 'attachment' =
      disposition === 'inline' && !INLINE_SAFE_TYPES.has(summary.contentType.toLowerCase())
        ? 'attachment'
        : disposition;
    const expiresSec =
      effectiveDisposition === 'inline' ? INLINE_URL_EXPIRES_SEC : ATTACHMENT_URL_EXPIRES_SEC;

    return this.objectStorage.signGetUrl(summary.bucket, summary.objectKey, expiresSec, {
      type: effectiveDisposition,
      fileName: summary.fileName,
    });
  }

  private resolvePublicConfig(): ResolvedMediaStorageConfig | null {
    const cfg = resolveMediaStorageConfig(this.config);
    if (!cfg && !this.publicConfigUnavailableWarned) {
      this.publicConfigUnavailableWarned = true;
      this.logger.warn(
        'media.publicUrls.unavailable: media storage config did not resolve (a MEDIA_* variable is missing, ' +
          'MEDIA_BUCKET_PUBLIC/MEDIA_BUCKET_PRIVATE collide, or values look like dev defaults under ' +
          'NODE_ENV=production); returning no public URLs until this is fixed',
      );
    }
    return cfg;
  }
}
