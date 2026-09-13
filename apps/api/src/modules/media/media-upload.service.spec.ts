import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FindOperator, Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from '../rbac/rbac.service';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { MediaObjectEntity, MediaOwnerType, MediaStatus } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { UPLOAD_TICKET_TTL_SECONDS } from './media.constants';
import { MediaUploadService } from './media-upload.service';
import { ObjectStorageService, StoredObjectHead } from './object-storage.service';

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

const GOODS_RECEIPT_POLICY = MEDIA_OWNER_POLICIES[MediaOwnerType.GOODS_RECEIPT];
const PRODUCT_POLICY = MEDIA_OWNER_POLICIES[MediaOwnerType.PRODUCT];

function makeMedia(overrides: Partial<MediaObjectEntity> = {}): MediaObjectEntity {
  return {
    id: 'media-1',
    organizationId: actor.organizationId,
    ownerType: MediaOwnerType.GOODS_RECEIPT,
    ownerId: null,
    status: MediaStatus.PENDING,
    bucket: 'erp-media-private',
    objectKey: `org/${actor.organizationId}/goods_receipt/media-1`,
    fileName: 'hoa-don.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    sortOrder: 0,
    createdBy: actor.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    attachedAt: null,
    deletedAt: null,
    objectRemovedAt: null,
    ...overrides,
  };
}

describe('MediaUploadService', () => {
  let mediaRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  let storage: { headObject: jest.Mock; deleteObject: jest.Mock; createUploadPolicy: jest.Mock };
  let rbac: { hasAnyPermission: jest.Mock };
  let config: ConfigService;
  let service: MediaUploadService;

  beforeEach(() => {
    mediaRepo = {
      findOne: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };
    storage = {
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      createUploadPolicy: jest.fn(),
    };
    rbac = { hasAnyPermission: jest.fn().mockResolvedValue(true) };
    config = new ConfigService(VALID_ENV);

    service = new MediaUploadService(
      mediaRepo as unknown as Repository<MediaObjectEntity>,
      storage as unknown as ObjectStorageService,
      rbac as unknown as RbacService,
      config,
    );
  });

  describe('requestUpload', () => {
    const validDto = {
      ownerType: MediaOwnerType.GOODS_RECEIPT,
      fileName: 'hoa-don.pdf',
      contentType: 'application/pdf',
      size: 500_000,
    };

    it('throws 403 when the actor lacks a write permission for the ownerType', async () => {
      rbac.hasAnyPermission.mockResolvedValue(false);

      await expect(service.requestUpload(validDto, actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mediaRepo.count).not.toHaveBeenCalled();
      expect(storage.createUploadPolicy).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
      expect(mediaRepo.update).not.toHaveBeenCalled();
    });

    it('answers 403, not 400, when permission is missing even if the content type is also invalid', async () => {
      rbac.hasAnyPermission.mockResolvedValue(false);

      await expect(
        service.requestUpload({ ...validDto, contentType: 'application/x-msdownload' }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('asks RbacService for the ownerType policy write permission keys', async () => {
      await service.requestUpload(validDto, actor).catch(() => undefined);

      expect(rbac.hasAnyPermission).toHaveBeenCalledWith(actor.userId, actor.organizationId, [
        ...GOODS_RECEIPT_POLICY.writePermissions,
      ]);
    });

    it('throws MEDIA_TYPE_NOT_ALLOWED for a content type outside the ownerType allowlist', async () => {
      await expect(
        service.requestUpload({ ...validDto, contentType: 'application/x-msdownload' }, actor),
      ).rejects.toMatchObject({ code: 'MEDIA_TYPE_NOT_ALLOWED', status: 400 });
      expect(mediaRepo.count).not.toHaveBeenCalled();
      expect(storage.createUploadPolicy).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });

    it('throws MEDIA_TOO_LARGE when size exceeds the ownerType limit', async () => {
      await expect(
        service.requestUpload({ ...validDto, size: GOODS_RECEIPT_POLICY.maxBytes + 1 }, actor),
      ).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE', status: 400 });
      expect(mediaRepo.count).not.toHaveBeenCalled();
      expect(storage.createUploadPolicy).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });

    it('counts every non-ATTACHED row by this org+creator in the last 24h (DB clock), not just PENDING/UPLOADED', async () => {
      storage.createUploadPolicy.mockResolvedValue({ url: 'http://public.example.com', fields: {} });

      await service.requestUpload(validDto, actor);

      expect(mediaRepo.count).toHaveBeenCalledTimes(1);
      const [{ where }] = mediaRepo.count.mock.calls[0];
      expect(where.organizationId).toBe('org-1');
      expect(where.createdBy).toBe('user-1');
      expect(where.status).toBeInstanceOf(FindOperator);
      expect((where.status as FindOperator<unknown>).type).toBe('not');
      expect((where.status as FindOperator<unknown>).value).toBe(MediaStatus.ATTACHED);
      expect(where.createdAt).toBeInstanceOf(FindOperator);
      expect((where.createdAt as FindOperator<unknown>).type).toBe('raw');
    });

    it('throws MEDIA_QUOTA_EXCEEDED (429) when 100 unattached uploads already exist today, incl. rejected/DELETED ones', async () => {
      mediaRepo.count.mockResolvedValue(100);

      await expect(service.requestUpload(validDto, actor)).rejects.toMatchObject({
        code: 'MEDIA_QUOTA_EXCEEDED',
        status: 429,
      });
      expect(storage.createUploadPolicy).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });

    it('proceeds when only 99 unattached uploads exist today', async () => {
      mediaRepo.count.mockResolvedValue(99);
      storage.createUploadPolicy.mockResolvedValue({ url: 'http://public.example.com', fields: {} });

      await expect(service.requestUpload(validDto, actor)).resolves.toBeDefined();
      expect(storage.createUploadPolicy).toHaveBeenCalled();
    });

    it('throws STORAGE_UNAVAILABLE (503) when storage is not configured', async () => {
      service = new MediaUploadService(
        mediaRepo as unknown as Repository<MediaObjectEntity>,
        storage as unknown as ObjectStorageService,
        rbac as unknown as RbacService,
        new ConfigService({ ...VALID_ENV, MEDIA_S3_ENDPOINT: undefined }),
      );

      await expect(service.requestUpload(validDto, actor)).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
      expect(storage.createUploadPolicy).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });

    it('signs the declared size, not the policy limit, so the ticket cannot be reused for a larger file', async () => {
      storage.createUploadPolicy.mockResolvedValue({ url: 'http://public.example.com', fields: {} });

      await service.requestUpload(validDto, actor);

      expect(validDto.size).toBeLessThan(GOODS_RECEIPT_POLICY.maxBytes);
      expect(storage.createUploadPolicy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        validDto.contentType,
        validDto.size,
        expect.any(Number),
      );
    });

    it('creates a PENDING row keyed by org/ownerType/id, signs before saving, and returns the ticket', async () => {
      storage.createUploadPolicy.mockResolvedValue({
        url: 'http://public.example.com/erp-media-private',
        fields: { key: 'org/org-1/goods_receipt/whatever', 'Content-Type': validDto.contentType },
      });

      const result = await service.requestUpload(validDto, actor);

      const [bucketArg, keyArg, contentTypeArg, maxBytesArg, ttlArg] = storage.createUploadPolicy.mock.calls[0];
      expect(bucketArg).toBe('erp-media-private');
      expect(contentTypeArg).toBe(validDto.contentType);
      expect(maxBytesArg).toBe(validDto.size);
      expect(ttlArg).toBe(600);

      const savedRow = mediaRepo.save.mock.calls[0][0];
      expect(savedRow).toEqual(
        expect.objectContaining({
          organizationId: actor.organizationId,
          ownerType: MediaOwnerType.GOODS_RECEIPT,
          ownerId: null,
          status: MediaStatus.PENDING,
          bucket: 'erp-media-private',
          objectKey: keyArg,
          fileName: validDto.fileName,
          contentType: validDto.contentType,
          sizeBytes: validDto.size,
          sortOrder: 0,
          createdBy: actor.userId,
        }),
      );

      const keySuffix = keyArg.split('/').pop();
      expect(keySuffix).toBe(savedRow.id);
      expect(keySuffix).toBe(result.mediaId);
      expect(keyArg).toBe(`org/${actor.organizationId}/goods_receipt/${result.mediaId}`);

      expect(storage.createUploadPolicy.mock.invocationCallOrder[0]).toBeLessThan(
        mediaRepo.save.mock.invocationCallOrder[0],
      );

      expect(result).toEqual({
        mediaId: savedRow.id,
        upload: { url: expect.any(String), fields: expect.any(Object) },
        expiresAt: expect.any(String),
      });
    });

    it('sets expiresAt to now + the ticket TTL', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      storage.createUploadPolicy.mockResolvedValue({ url: 'http://public.example.com', fields: {} });

      const result = await service.requestUpload(validDto, actor);

      expect(result.expiresAt).toBe(new Date(Date.now() + UPLOAD_TICKET_TTL_SECONDS * 1000).toISOString());
      jest.useRealTimers();
    });

    it('resolves the public bucket for a PRODUCT upload', async () => {
      rbac.hasAnyPermission.mockResolvedValue(true);
      storage.createUploadPolicy.mockResolvedValue({ url: 'http://public.example.com', fields: {} });

      await service.requestUpload(
        {
          ownerType: MediaOwnerType.PRODUCT,
          fileName: 'san-pham.png',
          contentType: 'image/png',
          size: 100_000,
        },
        actor,
      );

      expect(rbac.hasAnyPermission).toHaveBeenCalledWith(actor.userId, actor.organizationId, [
        ...PRODUCT_POLICY.writePermissions,
      ]);
      expect(storage.createUploadPolicy.mock.calls[0][0]).toBe('erp-media-public');
      expect(mediaRepo.save.mock.calls[0][0]).toEqual(expect.objectContaining({ bucket: 'erp-media-public' }));
    });
  });

  describe('completeUpload', () => {
    it('returns 404 when no row matches the actor organization and creator', async () => {
      mediaRepo.findOne.mockResolvedValue(undefined);

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_NOT_FOUND',
        status: 404,
      });
      expect(mediaRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'media-1', organizationId: actor.organizationId, createdBy: actor.userId },
      });
    });

    it('returns the same 200 body when called again on an already UPLOADED row, with no write', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: MediaStatus.UPLOADED }));

      const result = await service.completeUpload('media-1', actor);

      expect(storage.headObject).not.toHaveBeenCalled();
      expect(mediaRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        mediaId: 'media-1',
        status: MediaStatus.UPLOADED,
        fileName: 'hoa-don.pdf',
        contentType: 'application/pdf',
        size: 1024,
      });
    });

    it('throws MEDIA_STATE_CONFLICT (409) when the row is already ATTACHED', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: MediaStatus.ATTACHED }));

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_STATE_CONFLICT',
        status: 409,
      });
      expect(mediaRepo.update).not.toHaveBeenCalled();
    });

    it('throws MEDIA_STATE_CONFLICT (409) when the row is already DELETED', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: MediaStatus.DELETED }));

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_STATE_CONFLICT',
        status: 409,
      });
      expect(mediaRepo.update).not.toHaveBeenCalled();
    });

    it('deletes the object and marks the row DELETED when the uploaded size does not match', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ sizeBytes: 1024 }));
      storage.headObject.mockResolvedValue({ contentLength: 2048, contentType: 'application/pdf' } as StoredObjectHead);

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_INVALID',
        status: 400,
      });
      expect(mediaRepo.update).toHaveBeenCalledTimes(1);
      expect(mediaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'media-1', status: MediaStatus.PENDING }),
        { status: MediaStatus.DELETED, deletedAt: expect.any(Date) },
      );
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'erp-media-private',
        `org/${actor.organizationId}/goods_receipt/media-1`,
      );
      expect(mediaRepo.update.mock.invocationCallOrder[0]).toBeLessThan(
        storage.deleteObject.mock.invocationCallOrder[0],
      );
    });

    it('still throws MEDIA_INVALID, with no second update, when deleteObject itself rejects', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ sizeBytes: 1024 }));
      storage.headObject.mockResolvedValue({ contentLength: 2048, contentType: 'application/pdf' } as StoredObjectHead);
      storage.deleteObject.mockRejectedValue(new Error('S3 unavailable'));

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_INVALID',
        status: 400,
      });
      expect(mediaRepo.update).toHaveBeenCalledTimes(1);
    });

    it('does not call deleteObject when the DELETED update loses the PENDING race (affected 0)', async () => {
      mediaRepo.findOne
        .mockResolvedValueOnce(makeMedia({ status: MediaStatus.PENDING, sizeBytes: 1024 }))
        .mockResolvedValueOnce(makeMedia({ status: MediaStatus.ATTACHED, ownerId: 'owner-1' }));
      storage.headObject.mockResolvedValue({ contentLength: 2048, contentType: 'application/pdf' } as StoredObjectHead);
      mediaRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_STATE_CONFLICT',
        status: 409,
      });
      expect(mediaRepo.update).toHaveBeenCalledTimes(1);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('deletes the object and returns MEDIA_INVALID when the content type does not match', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ contentType: 'application/pdf' }));
      storage.headObject.mockResolvedValue({ contentLength: 1024, contentType: 'image/png' } as StoredObjectHead);

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_INVALID',
        status: 400,
      });
      expect(storage.deleteObject).toHaveBeenCalled();
    });

    it('marks the row DELETED without calling deleteObject when the object is missing', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia());
      storage.headObject.mockResolvedValue(null);

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_INVALID',
        status: 400,
      });
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(mediaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'media-1' }),
        expect.objectContaining({ status: MediaStatus.DELETED }),
      );
    });

    it('marks the row UPLOADED and returns 200 when the object matches', async () => {
      const media = makeMedia();
      mediaRepo.findOne.mockResolvedValue(media);
      storage.headObject.mockResolvedValue({ contentLength: 1024, contentType: 'application/pdf' } as StoredObjectHead);

      const result = await service.completeUpload('media-1', actor);

      expect(mediaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'media-1', status: MediaStatus.PENDING }),
        { status: MediaStatus.UPLOADED },
      );
      expect(result).toEqual({
        mediaId: 'media-1',
        status: MediaStatus.UPLOADED,
        fileName: 'hoa-don.pdf',
        contentType: 'application/pdf',
        size: 1024,
      });
    });

    it('re-answers from the current row, with no further write, when syncOwner attached it first', async () => {
      mediaRepo.findOne
        .mockResolvedValueOnce(makeMedia({ status: MediaStatus.PENDING }))
        .mockResolvedValueOnce(makeMedia({ status: MediaStatus.ATTACHED, ownerId: 'owner-1' }));
      storage.headObject.mockResolvedValue({ contentLength: 1024, contentType: 'application/pdf' } as StoredObjectHead);
      mediaRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.completeUpload('media-1', actor)).rejects.toMatchObject({
        code: 'MEDIA_STATE_CONFLICT',
        status: 409,
      });
      expect(mediaRepo.update).toHaveBeenCalledTimes(1);
      expect(mediaRepo.findOne).toHaveBeenCalledTimes(2);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('re-answers 200 with the same body when a concurrent call already completed the row', async () => {
      mediaRepo.findOne
        .mockResolvedValueOnce(makeMedia({ status: MediaStatus.PENDING }))
        .mockResolvedValueOnce(makeMedia({ status: MediaStatus.UPLOADED }));
      storage.headObject.mockResolvedValue({ contentLength: 1024, contentType: 'application/pdf' } as StoredObjectHead);
      mediaRepo.update.mockResolvedValue({ affected: 0 });

      const result = await service.completeUpload('media-1', actor);

      expect(result).toEqual({
        mediaId: 'media-1',
        status: MediaStatus.UPLOADED,
        fileName: 'hoa-don.pdf',
        contentType: 'application/pdf',
        size: 1024,
      });
      expect(mediaRepo.update).toHaveBeenCalledTimes(1);
      expect(mediaRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });
});

describe('CreateMediaUploadDto validation', () => {
  const validPayload = () => ({
    ownerType: MediaOwnerType.GOODS_RECEIPT,
    fileName: 'hoa-don.pdf',
    contentType: 'application/pdf',
    size: 1024,
  });

  const failedFields = (payload: object): string[] =>
    validateSync(plainToInstance(CreateMediaUploadDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).map((error) => error.property);

  it('accepts a well-formed payload', () => {
    expect(failedFields(validPayload())).toEqual([]);
  });

  it('rejects an empty fileName', () => {
    expect(failedFields({ ...validPayload(), fileName: '' })).toContain('fileName');
  });

  it('rejects a fileName containing a NUL byte (would otherwise 500 in Postgres)', () => {
    const fileName = 'evil' + String.fromCharCode(0x0000) + '.pdf';
    expect(failedFields({ ...validPayload(), fileName })).toContain('fileName');
  });

  it('rejects a fileName containing a bidi override character (extension-spoofing)', () => {
    const fileName = 'invoice' + String.fromCharCode(0x202e) + 'fdp.exe';
    expect(failedFields({ ...validPayload(), fileName })).toContain('fileName');
  });

  it('accepts an ordinary Vietnamese fileName (precomposed letters, not control/bidi characters)', () => {
    const fileName = 'hóa đơn.pdf';
    expect(failedFields({ ...validPayload(), fileName })).toEqual([]);
  });

  it('rejects DEL (U+007F), the first C1 control (U+009F), and the bidi isolate range boundaries (U+2066, U+2069)', () => {
    const boundaries = [0x007f, 0x009f, 0x2066, 0x2069];
    for (const codePoint of boundaries) {
      const fileName = 'a' + String.fromCharCode(codePoint) + '.pdf';
      expect(failedFields({ ...validPayload(), fileName })).toContain('fileName');
    }
  });

  it('rejects zero-width and BOM characters (U+200B, U+FEFF) that can hide inside an otherwise-identical name', () => {
    for (const codePoint of [0x200b, 0xfeff]) {
      const fileName = 'a' + String.fromCharCode(codePoint) + '.pdf';
      expect(failedFields({ ...validPayload(), fileName })).toContain('fileName');
    }
  });

  it('rejects a contentType longer than the media_objects column width (100)', () => {
    expect(failedFields({ ...validPayload(), contentType: 'a'.repeat(101) })).toContain('contentType');
  });

  it('rejects a size above the largest declarable size (10 MiB)', () => {
    expect(failedFields({ ...validPayload(), size: 10 * 1024 * 1024 + 1 })).toContain('size');
  });
});
