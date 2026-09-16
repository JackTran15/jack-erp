import { ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from '../rbac/rbac.service';
import { GetMediaDownloadUrlResponseDto } from './dto/media-download.response.dto';
import { MediaDownloadController } from './media-download.controller';
import { MediaDownloadService } from './media-download.service';
import { MediaObjectEntity, MediaOwnerType, MediaStatus } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { MediaOwnerReaderRegistry } from './media-owner-reader.registry';
import { ATTACHMENT_URL_EXPIRES_SEC, MediaQueryService } from './media-query.service';

const VALID_ENV: Record<string, string> = {
  MEDIA_S3_ENDPOINT: 'http://minio.internal:9000',
  MEDIA_PUBLIC_BASE_URL: 'http://public.example.com',
  MEDIA_S3_REGION: 'us-east-1',
  MEDIA_S3_ACCESS_KEY: 'REDACTED',
  MEDIA_S3_SECRET_KEY: 'REDACTED',
  MEDIA_BUCKET_PUBLIC: 'erp-media-public',
  MEDIA_BUCKET_PRIVATE: 'erp-media-private',
};

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  roles: [],
};

const PRIVATE_MEDIA_ID = '5f1c2e10-1234-4abc-8def-1234567890ab';
const OBJECT_KEY = `org/${actor.organizationId}/goods_receipt/${PRIVATE_MEDIA_ID}`;

function makeMedia(overrides: Partial<MediaObjectEntity> = {}): MediaObjectEntity {
  return {
    id: PRIVATE_MEDIA_ID,
    organizationId: actor.organizationId,
    ownerType: MediaOwnerType.GOODS_RECEIPT,
    ownerId: 'owner-1',
    status: MediaStatus.ATTACHED,
    bucket: 'erp-media-private',
    objectKey: OBJECT_KEY,
    fileName: 'hoa-don.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    sortOrder: 0,
    createdBy: actor.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    attachedAt: new Date(),
    deletedAt: null,
    objectRemovedAt: null,
    ...overrides,
  };
}

describe('MediaOwnerReaderRegistry', () => {
  let registry: MediaOwnerReaderRegistry;

  beforeEach(() => {
    registry = new MediaOwnerReaderRegistry();
  });

  it('returns the reader registered for an ownerType', () => {
    const reader = jest.fn().mockResolvedValue(true);
    registry.register(MediaOwnerType.GOODS_RECEIPT, reader);

    expect(registry.get(MediaOwnerType.GOODS_RECEIPT)).toBe(reader);
  });

  it('returns undefined when no reader was registered for an ownerType', () => {
    expect(registry.get(MediaOwnerType.CASH_RECEIPT)).toBeUndefined();
  });

  it('throws immediately on a duplicate registration for the same ownerType', () => {
    registry.register(MediaOwnerType.GOODS_RECEIPT, jest.fn());

    expect(() => registry.register(MediaOwnerType.GOODS_RECEIPT, jest.fn())).toThrow(
      /already registered.*GOODS_RECEIPT/,
    );
  });
});

describe('MediaDownloadService', () => {
  let mediaRepo: { findOne: jest.Mock };
  let mediaQuery: { publicUrlFor: jest.Mock; signReadUrl: jest.Mock };
  let rbac: { hasAnyPermission: jest.Mock };
  let readers: MediaOwnerReaderRegistry;
  let config: ConfigService;
  let service: MediaDownloadService;

  beforeEach(() => {
    mediaRepo = { findOne: jest.fn() };
    mediaQuery = { publicUrlFor: jest.fn(), signReadUrl: jest.fn() };
    rbac = { hasAnyPermission: jest.fn().mockResolvedValue(true) };
    readers = new MediaOwnerReaderRegistry();
    config = new ConfigService(VALID_ENV);

    service = new MediaDownloadService(
      mediaRepo as unknown as Repository<MediaObjectEntity>,
      mediaQuery as unknown as MediaQueryService,
      rbac as unknown as RbacService,
      readers,
      config,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('rejects a non-UUID id with 404 without querying the database', async () => {
    await expect(service.getDownloadUrl('not-a-uuid', actor)).rejects.toMatchObject({
      code: 'MEDIA_NOT_FOUND',
      status: 404,
    });
    expect(mediaRepo.findOne).not.toHaveBeenCalled();
  });

  it('lowercases the id before querying', async () => {
    mediaRepo.findOne.mockResolvedValue(null);

    await service.getDownloadUrl(PRIVATE_MEDIA_ID.toUpperCase(), actor).catch(() => undefined);

    expect(mediaRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: PRIVATE_MEDIA_ID.toLowerCase(),
        organizationId: actor.organizationId,
        status: MediaStatus.ATTACHED,
      },
    });
  });

  it('returns 404 when the media belongs to a different organization (no row found)', async () => {
    mediaRepo.findOne.mockResolvedValue(null);

    await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
      code: 'MEDIA_NOT_FOUND',
      status: 404,
    });
    expect(mediaRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: actor.organizationId }),
    });
  });

  it('returns 404 when the media is not yet ATTACHED (no row found)', async () => {
    // The query filters on status = ATTACHED, so a PENDING/UPLOADED/DELETED
    // row surfaces identically to "no row" — no existence oracle.
    mediaRepo.findOne.mockResolvedValue(null);

    await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
      code: 'MEDIA_NOT_FOUND',
      status: 404,
    });
    expect(mediaRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: MediaStatus.ATTACHED }),
    });
  });

  describe('public media', () => {
    beforeEach(() => {
      mediaRepo.findOne.mockResolvedValue(
        makeMedia({ ownerType: MediaOwnerType.PRODUCT, bucket: 'erp-media-public' }),
      );
    });

    it('returns the public URL with expiresAt: null, never checking permission, reader or signReadUrl', async () => {
      const reader = jest.fn().mockResolvedValue(true);
      readers.register(MediaOwnerType.PRODUCT, reader);
      mediaQuery.publicUrlFor.mockReturnValue('http://public.example.com/erp-media-public/org/org-1/product/x');

      const result = await service.getDownloadUrl(PRIVATE_MEDIA_ID, actor);

      expect(result).toEqual({
        url: 'http://public.example.com/erp-media-public/org/org-1/product/x',
        expiresAt: null,
      });
      expect(rbac.hasAnyPermission).not.toHaveBeenCalled();
      expect(reader).not.toHaveBeenCalled();
      expect(mediaQuery.signReadUrl).not.toHaveBeenCalled();
    });

    it('answers 503 STORAGE_UNAVAILABLE when storage is not configured, without calling publicUrlFor', async () => {
      // An explicit empty string, not `undefined`: `ConfigService.get` falls
      // back to `process.env` for an `undefined` internal value, which would
      // let a real MEDIA_S3_ENDPOINT set in this process leak into the test.
      service = new MediaDownloadService(
        mediaRepo as unknown as Repository<MediaObjectEntity>,
        mediaQuery as unknown as MediaQueryService,
        rbac as unknown as RbacService,
        readers,
        new ConfigService({ ...VALID_ENV, MEDIA_S3_ENDPOINT: '' }),
      );

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
      expect(mediaQuery.publicUrlFor).not.toHaveBeenCalled();
    });

    it('answers 404 MEDIA_NOT_FOUND when storage is configured but publicUrlFor returns null (malformed key)', async () => {
      mediaQuery.publicUrlFor.mockReturnValue(null);

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
        code: 'MEDIA_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('private media', () => {
    beforeEach(() => {
      mediaRepo.findOne.mockResolvedValue(makeMedia());
    });

    it('answers 403 with a generic message (no ownerType) when the actor lacks the read permission', async () => {
      rbac.hasAnyPermission.mockResolvedValue(false);

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
        message: 'Missing required permission to read this media',
      });
      expect(rbac.hasAnyPermission).toHaveBeenCalledWith(
        actor.userId,
        actor.organizationId,
        MEDIA_OWNER_POLICIES[MediaOwnerType.GOODS_RECEIPT].readPermissions,
      );
    });

    it('answers 403 as a ForbiddenException', async () => {
      rbac.hasAnyPermission.mockResolvedValue(false);

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 404, logs organizationId/mediaId/ownerType, and never the object key, when no reader is registered', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
        code: 'MEDIA_NOT_FOUND',
        status: 404,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        `media.download.noReader organizationId=${actor.organizationId} mediaId=${PRIVATE_MEDIA_ID} ownerType=GOODS_RECEIPT`,
      );
      const [warnedMessage] = warnSpy.mock.calls[0];
      expect(warnedMessage).not.toContain(OBJECT_KEY);
    });

    it('answers 404 without calling the reader when the ATTACHED row has a null ownerId', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ ownerId: null }));
      const reader = jest.fn().mockResolvedValue(true);
      readers.register(MediaOwnerType.GOODS_RECEIPT, reader);

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
        code: 'MEDIA_NOT_FOUND',
        status: 404,
      });
      expect(reader).not.toHaveBeenCalled();
    });

    it('answers 404 when the registered reader returns false', async () => {
      const reader = jest.fn().mockResolvedValue(false);
      readers.register(MediaOwnerType.GOODS_RECEIPT, reader);

      await expect(service.getDownloadUrl(PRIVATE_MEDIA_ID, actor)).rejects.toMatchObject({
        code: 'MEDIA_NOT_FOUND',
        status: 404,
      });
      expect(reader).toHaveBeenCalledWith('owner-1', actor);
    });

    it('signs a link expiring ATTACHMENT_URL_EXPIRES_SEC from now when the reader allows the actor', async () => {
      readers.register(MediaOwnerType.GOODS_RECEIPT, jest.fn().mockResolvedValue(true));
      // The real signer always encodes its own expiry in the URL, but this
      // service no longer parses it back out (that threw whenever a stub
      // signer — e.g. the e2e fake — omitted `X-Amz-Expires`); any string is
      // fine here.
      mediaQuery.signReadUrl.mockResolvedValue('https://signed.example.com/whatever');
      jest.useFakeTimers().setSystemTime(new Date('2026-09-13T10:00:05.000Z'));

      const result = await service.getDownloadUrl(PRIVATE_MEDIA_ID, actor);

      expect(mediaQuery.signReadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ id: PRIVATE_MEDIA_ID, bucket: 'erp-media-private' }),
        actor.organizationId,
        'attachment',
      );
      expect(result.url).toBe('https://signed.example.com/whatever');
      expect(result.expiresAt).toBe(
        new Date(Date.now() + ATTACHMENT_URL_EXPIRES_SEC * 1000).toISOString(),
      );
    });
  });
});

describe('MediaDownloadController', () => {
  it('answers Cache-Control: no-store on GET /media/:id/download-url', () => {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      MediaDownloadController.prototype.getDownloadUrl,
    );

    expect(headers).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });

  it('delegates to MediaDownloadService.getDownloadUrl', async () => {
    const downloads = { getDownloadUrl: jest.fn().mockResolvedValue({ url: 'x', expiresAt: null }) };
    const controller = new MediaDownloadController(downloads as never);

    const result: GetMediaDownloadUrlResponseDto = await controller.getDownloadUrl(PRIVATE_MEDIA_ID, actor);

    expect(downloads.getDownloadUrl).toHaveBeenCalledWith(PRIVATE_MEDIA_ID, actor);
    expect(result).toEqual({ url: 'x', expiresAt: null });
  });
});
