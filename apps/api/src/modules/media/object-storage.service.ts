import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  resolveMediaStorageConfig,
  ResolvedMediaStorageConfig,
} from './media-storage.config';
import { MediaException } from './media.exception';

export interface UploadPolicy {
  url: string;
  fields: Record<string, string>;
}

export interface StoredObjectHead {
  contentLength: number;
  contentType?: string;
}

export interface DownloadDisposition {
  type: 'inline' | 'attachment';
  fileName?: string;
}

function isConnectionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (
    code &&
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(code)
  ) {
    return true;
  }
  return ['TimeoutError', 'RequestTimeout', 'NetworkingError'].includes(err.name);
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const withMetadata = err as Error & { $metadata?: { httpStatusCode?: number } };
  return err.name === 'NotFound' || withMetadata.$metadata?.httpStatusCode === 404;
}

function isNoSuchBucketPolicy(err: unknown): boolean {
  return err instanceof Error && err.name === 'NoSuchBucketPolicy';
}

const VALID_DISPOSITION_TYPES = new Set(['inline', 'attachment']);

/**
 * TypeScript's `DownloadDisposition['type']` union only helps callers that stay in
 * TypeScript; a future controller forwarding a query/body value straight through
 * could otherwise inject arbitrary header syntax (e.g. `inline; filename=evil.html`)
 * as the "type". Guard it at runtime too.
 */
function assertValidDispositionType(type: string): void {
  if (!VALID_DISPOSITION_TYPES.has(type)) {
    throw new Error(`Invalid Content-Disposition type: "${type}"; expected "inline" or "attachment".`);
  }
}

/**
 * `encodeURIComponent` throws `URIError` on a lone (unpaired) surrogate, which
 * would otherwise turn a malformed file name into an uncaught 500 instead of a
 * handled error. `String.prototype.toWellFormed` (ES2024) would do this in one
 * call, but the repo's `tsconfig.base.json` pins `lib` to `ES2022`, so replace
 * unpaired surrogates with U+FFFD by hand instead.
 */
function toWellFormedFileName(fileName: string): string {
  return fileName.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

/** Strips control characters, non-ASCII characters, `"` and `\` for the legacy `filename=` fallback. */
function asciiFallbackFileName(fileName: string): string {
  let result = '';
  for (const char of fileName) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || code > 0x7e) continue;
    if (char === '"' || char === '\\') continue;
    result += char;
  }
  return result;
}

/** RFC 5987 `ext-value` encoding for `filename*=UTF-8''...`. */
function rfc5987EncodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds `Content-Disposition` in this class instead of accepting a raw header
 * string from callers, so nothing upstream can inject header syntax through a
 * file name. Omits both `filename` parameters when there is no name to send, and
 * omits the ASCII `filename=` parameter alone when a name is entirely non-ASCII
 * (e.g. "文件") — an empty `filename=""` is worse than no fallback at all.
 */
function buildContentDisposition(disposition: DownloadDisposition): string {
  assertValidDispositionType(disposition.type);
  if (!disposition.fileName) return disposition.type;

  const fileName = toWellFormedFileName(disposition.fileName);
  const ascii = asciiFallbackFileName(fileName);
  const encoded = rfc5987EncodeFileName(fileName);
  const asciiParam = ascii ? `filename="${ascii}"; ` : '';
  return `${disposition.type}; ${asciiParam}filename*=UTF-8''${encoded}`;
}

/**
 * Only class allowed to talk to object storage (ADR-01, 03-logical-design.md).
 * Constructing it never touches the network — the two `S3Client`s are created
 * lazily on first use — so `AppModule` boots fine even when MinIO is unreachable;
 * every method below throws `MediaException(503, 'STORAGE_UNAVAILABLE')` instead
 * when the config is missing or the connection fails.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private clients: { api: S3Client; signing: S3Client } | null = null;

  constructor(private readonly config: ConfigService) {}

  private resolveConfig(): ResolvedMediaStorageConfig {
    const resolved = resolveMediaStorageConfig(this.config);
    if (!resolved) {
      throw new MediaException(503, 'STORAGE_UNAVAILABLE', 'Media storage is not configured');
    }
    return resolved;
  }

  private getClients(cfg: ResolvedMediaStorageConfig): { api: S3Client; signing: S3Client } {
    if (!this.clients) {
      const credentials = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey };
      this.clients = {
        // Calls HeadObject/DeleteObject/HeadBucket/CreateBucket/PutBucketPolicy/
        // GetBucketPolicy for real. Short timeouts plus a low retry count so a host
        // that silently drops packets reaches the 503 in seconds instead of hanging
        // for minutes on the SDK's default retry backoff.
        api: new S3Client({
          endpoint: cfg.s3Endpoint,
          region: cfg.region,
          credentials,
          forcePathStyle: true,
          requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
          maxAttempts: 2,
        }),
        // Only ever used to sign (createPresignedPost / getSignedUrl), never to call
        // the network — the browser, not this process, sends the actual request to
        // MEDIA_PUBLIC_BASE_URL — so it needs no timeout override.
        signing: new S3Client({
          endpoint: cfg.publicBaseUrl,
          region: cfg.region,
          credentials,
          forcePathStyle: true,
        }),
      };
    }
    return this.clients;
  }

  private async withConnectionGuard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (isConnectionFailure(err)) {
        throw new MediaException(503, 'STORAGE_UNAVAILABLE', 'Object storage is unreachable');
      }
      throw err;
    }
  }

  /**
   * Returns `null` on a 404, which S3/MinIO returns identically whether the object
   * is missing or the bucket itself does not exist. Callers may treat a `null` as
   * "object missing" only because bucket names always come from config
   * (`MEDIA_BUCKET_PUBLIC` / `MEDIA_BUCKET_PRIVATE`) plus `ensureBuckets`, never from
   * user input — a missing bucket here would be an infra bug, not a normal outcome.
   * Throws (never swallows) any other S3 error.
   */
  async headObject(bucket: string, key: string): Promise<StoredObjectHead | null> {
    const cfg = this.resolveConfig();
    const { api } = this.getClients(cfg);
    try {
      const result = await this.withConnectionGuard(() =>
        api.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
      );
      return { contentLength: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const cfg = this.resolveConfig();
    const { api } = this.getClients(cfg);
    await this.withConnectionGuard(() => api.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
  }

  /**
   * `createPresignedPost` with a fixed `Key`, a `content-length-range` condition and
   * an exact `Content-Type` condition (ADR-02) — storage itself rejects an oversized
   * or mistyped upload; `headObject` at confirm time only double-checks. Signed
   * against `MEDIA_PUBLIC_BASE_URL`, the host the browser actually posts to.
   */
  async createUploadPolicy(
    bucket: string,
    key: string,
    contentType: string,
    maxBytes: number,
    expiresSec: number,
  ): Promise<UploadPolicy> {
    const cfg = this.resolveConfig();
    const { signing } = this.getClients(cfg);
    const { url, fields } = await this.withConnectionGuard(() =>
      createPresignedPost(signing, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 1, maxBytes],
          { 'Content-Type': contentType },
        ],
        Fields: { 'Content-Type': contentType },
        Expires: expiresSec,
      }),
    );
    return { url, fields };
  }

  /**
   * Presigned GET, signed against `MEDIA_PUBLIC_BASE_URL`. Builds
   * `Content-Disposition` itself from `{ type, fileName }` (never a raw header
   * string) so a file name can carry `"`, backslashes or non-ASCII text without
   * corrupting the header: `filename="<ASCII fallback>"; filename*=UTF-8''<RFC 5987>`.
   */
  async signGetUrl(
    bucket: string,
    key: string,
    expiresSec: number,
    disposition?: DownloadDisposition,
  ): Promise<string> {
    const cfg = this.resolveConfig();
    const { signing } = this.getClients(cfg);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(disposition ? { ResponseContentDisposition: buildContentDisposition(disposition) } : {}),
    });
    return this.withConnectionGuard(() => getSignedUrl(signing, command, { expiresIn: expiresSec }));
  }

  /**
   * `HeadBucket` -> `CreateBucket` if missing, for both buckets; the public bucket
   * additionally gets a `PutBucketPolicy` allowing anonymous `s3:GetObject`
   * (ADR-04). The private bucket instead gets checked for an existing policy — see
   * `assertNoBucketPolicy`. Re-running is a no-op (AC-18): `HeadBucket` finds the
   * bucket the second time, and re-applying the same public policy is idempotent.
   */
  async ensureBuckets(): Promise<void> {
    const cfg = this.resolveConfig();
    const { api } = this.getClients(cfg);
    await this.ensureBucket(api, cfg.bucketPublic, true);
    await this.ensureBucket(api, cfg.bucketPrivate, false);
  }

  private async ensureBucket(api: S3Client, bucket: string, isPublic: boolean): Promise<void> {
    const exists = await this.headBucketExists(api, bucket);
    if (!exists) {
      await this.withConnectionGuard(() => api.send(new CreateBucketCommand({ Bucket: bucket })));
      this.logger.log(`Created bucket "${bucket}"`);
    }

    if (isPublic) {
      await this.withConnectionGuard(() =>
        api.send(
          new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: JSON.stringify(this.publicReadPolicy(bucket)),
          }),
        ),
      );
      return;
    }

    await this.assertNoBucketPolicy(api, bucket);
  }

  /**
   * A bucket policy on the private bucket could grant anonymous or wider access
   * than intended (ADR-04 relies on it having none). Never deletes an existing
   * policy — an operator may have a reason for it — just refuses to proceed so the
   * mismatch is not silently accepted.
   */
  private async assertNoBucketPolicy(api: S3Client, bucket: string): Promise<void> {
    try {
      await this.withConnectionGuard(() => api.send(new GetBucketPolicyCommand({ Bucket: bucket })));
    } catch (err) {
      if (isNoSuchBucketPolicy(err)) return;
      throw err;
    }
    throw new Error(
      `Bucket "${bucket}" is configured as private (MEDIA_BUCKET_PRIVATE) but already has a bucket policy attached. Remove it by hand — this service will not delete it — then re-run media:bootstrap.`,
    );
  }

  private async headBucketExists(api: S3Client, bucket: string): Promise<boolean> {
    try {
      await this.withConnectionGuard(() => api.send(new HeadBucketCommand({ Bucket: bucket })));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  private publicReadPolicy(bucket: string): Record<string, unknown> {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };
  }
}
