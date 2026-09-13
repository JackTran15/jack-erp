import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { parse as parseDotenv } from 'dotenv';
import type { ConfigService } from '@nestjs/config';

export interface ResolvedMediaStorageConfig {
  s3Endpoint: string;
  publicBaseUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketPublic: string;
  bucketPrivate: string;
}

const logger = new Logger('MediaStorageConfig');

let loggedProductionMisconfig = false;
let loggedBucketCollision = false;
let devDefaultsCache: { accessKeyId?: string; secretAccessKey?: string } | undefined;

/**
 * Read the dev placeholder MEDIA_S3_ACCESS_KEY / MEDIA_S3_SECRET_KEY straight out of
 * `.env.example` with the same parser ConfigModule itself uses (`dotenv.parse`),
 * instead of duplicating them as literals here or re-implementing dotenv's own
 * quoting/comment/`export` rules with a regex. So the production guard below never
 * drifts from the file it is actually guarding against (`app.module.ts:66-70` falls
 * back to `.env.example` when a var is unset).
 */
function getDevDefaults(): { accessKeyId?: string; secretAccessKey?: string } {
  if (devDefaultsCache) return devDefaultsCache;

  devDefaultsCache = {};
  try {
    const envExamplePath = join(__dirname, '..', '..', '..', '.env.example');
    const parsed = parseDotenv(readFileSync(envExamplePath));
    devDefaultsCache = {
      accessKeyId: parsed.MEDIA_S3_ACCESS_KEY,
      secretAccessKey: parsed.MEDIA_S3_SECRET_KEY,
    };
  } catch {
    // .env.example missing (e.g. a stripped production image): nothing to compare
    // against, so the production guard below falls through on the loopback check.
  }
  return devDefaultsCache;
}

// `new URL(...).hostname` always renders an IPv6 host with brackets (`[::1]`), so a
// bare `::1` can never match and is deliberately not listed here.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function isLoopbackHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Resolve `ObjectStorageService`'s configuration from environment, following the
 * `resolveKafkaConfig` pattern (`modules/events/kafka-config.ts`): a pure read of
 * `ConfigService`, no network calls. Returns `null` when any of the 7 `MEDIA_*`
 * variables is missing, when the two bucket names collide, or when
 * `NODE_ENV=production` but the values look like the dev defaults — callers turn a
 * `null` into `MediaException(503, 'STORAGE_UNAVAILABLE')` instead of booting with a
 * config that would quietly write to development storage or sign with dev
 * credentials.
 *
 * MinIO is deployed on the same host as the API in production (A-07), so a loopback
 * `MEDIA_S3_ENDPOINT` is a legitimate production value and is never rejected on its
 * own. Only `MEDIA_PUBLIC_BASE_URL` — the host the browser actually talks to — is
 * checked for loopback, since that one can never be legitimately internal.
 */
export function resolveMediaStorageConfig(
  config: ConfigService,
): ResolvedMediaStorageConfig | null {
  const s3Endpoint = config.get<string>('MEDIA_S3_ENDPOINT');
  const publicBaseUrl = config.get<string>('MEDIA_PUBLIC_BASE_URL');
  const region = config.get<string>('MEDIA_S3_REGION');
  const accessKeyId = config.get<string>('MEDIA_S3_ACCESS_KEY');
  const secretAccessKey = config.get<string>('MEDIA_S3_SECRET_KEY');
  const bucketPublic = config.get<string>('MEDIA_BUCKET_PUBLIC');
  const bucketPrivate = config.get<string>('MEDIA_BUCKET_PRIVATE');

  if (
    !s3Endpoint ||
    !publicBaseUrl ||
    !region ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketPublic ||
    !bucketPrivate
  ) {
    return null;
  }

  // Same bucket for both roles would put the public bucket's anonymous-read policy
  // (ADR-04) on top of what is supposed to be the private bucket, in every
  // environment, not just production.
  if (bucketPublic === bucketPrivate) {
    if (!loggedBucketCollision) {
      logger.error(
        `MEDIA_BUCKET_PUBLIC and MEDIA_BUCKET_PRIVATE both resolve to "${bucketPublic}"; treating media storage as unconfigured instead of applying an anonymous-read policy to private objects.`,
      );
      loggedBucketCollision = true;
    }
    return null;
  }

  if (config.get<string>('NODE_ENV') === 'production') {
    const devDefaults = getDevDefaults();
    const looksLikeDevConfig =
      isLoopbackHost(publicBaseUrl) ||
      (!!devDefaults.accessKeyId && accessKeyId === devDefaults.accessKeyId) ||
      (!!devDefaults.secretAccessKey && secretAccessKey === devDefaults.secretAccessKey);

    if (looksLikeDevConfig) {
      if (!loggedProductionMisconfig) {
        logger.error(
          'MEDIA_* variables resolved to development defaults (loopback MEDIA_PUBLIC_BASE_URL or dev credentials) under NODE_ENV=production; treating media storage as unconfigured.',
        );
        loggedProductionMisconfig = true;
      }
      return null;
    }
  }

  return {
    s3Endpoint,
    publicBaseUrl,
    region,
    accessKeyId,
    secretAccessKey,
    bucketPublic,
    bucketPrivate,
  };
}
