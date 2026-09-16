import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse as parseDotenv } from 'dotenv';
import { resolveMediaStorageConfig } from './media-storage.config';

const VALID_ENV: Record<string, string> = {
  MEDIA_S3_ENDPOINT: 'http://minio.internal:9000',
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.com',
  MEDIA_S3_REGION: 'us-east-1',
  MEDIA_S3_ACCESS_KEY: 'REDACTED',
  MEDIA_S3_SECRET_KEY: 'REDACTED',
  MEDIA_BUCKET_PUBLIC: 'erp-media-public',
  MEDIA_BUCKET_PRIVATE: 'erp-media-private',
};

function configFrom(env: Record<string, string | undefined>): ConfigService {
  return new ConfigService(env);
}

function readDevDefaults(): { accessKeyId: string; secretAccessKey: string } {
  const raw = readFileSync(join(__dirname, '..', '..', '..', '.env.example'));
  const parsed = parseDotenv(raw);
  const accessKeyId = parsed.MEDIA_S3_ACCESS_KEY;
  const secretAccessKey = parsed.MEDIA_S3_SECRET_KEY;
  expect(accessKeyId).toBeTruthy();
  expect(secretAccessKey).toBeTruthy();
  return { accessKeyId, secretAccessKey };
}

describe('resolveMediaStorageConfig', () => {
  it('resolves every field when all 7 variables are set', () => {
    const resolved = resolveMediaStorageConfig(configFrom(VALID_ENV));
    expect(resolved).toEqual({
      s3Endpoint: VALID_ENV.MEDIA_S3_ENDPOINT,
      publicBaseUrl: VALID_ENV.MEDIA_PUBLIC_BASE_URL,
      region: VALID_ENV.MEDIA_S3_REGION,
      accessKeyId: VALID_ENV.MEDIA_S3_ACCESS_KEY,
      secretAccessKey: VALID_ENV.MEDIA_S3_SECRET_KEY,
      bucketPublic: VALID_ENV.MEDIA_BUCKET_PUBLIC,
      bucketPrivate: VALID_ENV.MEDIA_BUCKET_PRIVATE,
    });
  });

  it.each(Object.keys(VALID_ENV))('returns null when %s is missing', (missingKey) => {
    const env = { ...VALID_ENV, [missingKey]: undefined };
    expect(resolveMediaStorageConfig(configFrom(env))).toBeNull();
  });

  it('returns null and logs once when MEDIA_BUCKET_PUBLIC and MEDIA_BUCKET_PRIVATE are the same', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const config = configFrom({
      ...VALID_ENV,
      MEDIA_BUCKET_PRIVATE: VALID_ENV.MEDIA_BUCKET_PUBLIC,
    });

    expect(resolveMediaStorageConfig(config)).toBeNull();
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('returns null and logs once when NODE_ENV=production and the public base URL is loopback', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const config = configFrom({
      ...VALID_ENV,
      NODE_ENV: 'production',
      MEDIA_S3_ENDPOINT: 'https://minio.prod.internal:9000',
      MEDIA_PUBLIC_BASE_URL: 'http://localhost:3000',
    });

    expect(resolveMediaStorageConfig(config)).toBeNull();
    expect(resolveMediaStorageConfig(config)).toBeNull();
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  it.each([
    ['http://127.0.0.1:3000'],
    ['http://[::1]:3000'],
    ['http://0.0.0.0:3000'],
  ])('returns null when NODE_ENV=production and the public base URL is loopback (%s)', (loopbackUrl) => {
    const config = configFrom({
      ...VALID_ENV,
      NODE_ENV: 'production',
      MEDIA_S3_ENDPOINT: 'https://minio.prod.internal:9000',
      MEDIA_PUBLIC_BASE_URL: loopbackUrl,
    });
    expect(resolveMediaStorageConfig(config)).toBeNull();
  });

  it('does NOT reject a loopback MEDIA_S3_ENDPOINT in production: MinIO runs on the same host as the API (A-07)', () => {
    const devDefaults = readDevDefaults();
    const config = configFrom({
      ...VALID_ENV,
      NODE_ENV: 'production',
      MEDIA_S3_ENDPOINT: 'http://127.0.0.1:9000',
      MEDIA_PUBLIC_BASE_URL: 'https://media.prod.example.com',
      MEDIA_S3_ACCESS_KEY: `not-${devDefaults.accessKeyId}`,
      MEDIA_S3_SECRET_KEY: `not-${devDefaults.secretAccessKey}`,
    });

    expect(resolveMediaStorageConfig(config)).toEqual({
      s3Endpoint: 'http://127.0.0.1:9000',
      publicBaseUrl: 'https://media.prod.example.com',
      region: VALID_ENV.MEDIA_S3_REGION,
      accessKeyId: `not-${devDefaults.accessKeyId}`,
      secretAccessKey: `not-${devDefaults.secretAccessKey}`,
      bucketPublic: VALID_ENV.MEDIA_BUCKET_PUBLIC,
      bucketPrivate: VALID_ENV.MEDIA_BUCKET_PRIVATE,
    });
  });

  it('returns null when NODE_ENV=production and the access/secret key match the .env.example dev defaults', () => {
    const devDefaults = readDevDefaults();
    const config = configFrom({
      ...VALID_ENV,
      NODE_ENV: 'production',
      MEDIA_S3_ENDPOINT: 'https://minio.prod.internal:9000',
      MEDIA_PUBLIC_BASE_URL: 'https://media.prod.example.com',
      MEDIA_S3_ACCESS_KEY: devDefaults.accessKeyId,
      MEDIA_S3_SECRET_KEY: devDefaults.secretAccessKey,
    });
    expect(resolveMediaStorageConfig(config)).toBeNull();
  });

  it('resolves normally in production when endpoint, base URL and credentials are all non-dev', () => {
    const config = configFrom({
      ...VALID_ENV,
      NODE_ENV: 'production',
      MEDIA_S3_ENDPOINT: 'https://minio.prod.internal:9000',
      MEDIA_PUBLIC_BASE_URL: 'https://media.prod.example.com',
    });
    expect(resolveMediaStorageConfig(config)).not.toBeNull();
  });
});
