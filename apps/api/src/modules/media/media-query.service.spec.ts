import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MediaQueryService, MediaSummary, toMediaSummary } from './media-query.service';
import { MediaObjectEntity, MediaOwnerType, MediaStatus } from './media-object.entity';
import { ObjectStorageService } from './object-storage.service';

interface FakeQb {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
}

function makeQb(rows: Partial<MediaObjectEntity>[]): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    where: jest.fn(self),
    andWhere: jest.fn(self),
    orderBy: jest.fn(self),
    addOrderBy: jest.fn(self),
    getMany: jest.fn().mockResolvedValue(rows),
  });
  return qb as FakeQb;
}

function row(overrides: Partial<MediaObjectEntity>): MediaObjectEntity {
  return {
    id: 'media-id',
    organizationId: 'org-1',
    ownerType: MediaOwnerType.GOODS_RECEIPT,
    ownerId: 'owner-1',
    status: MediaStatus.ATTACHED,
    bucket: 'erp-media-private',
    objectKey: 'org/org-1/goods_receipt/media-id',
    fileName: 'file.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    sortOrder: 0,
    createdBy: 'user-1',
    createdAt: new Date('2026-09-13T00:00:00.000Z'),
    updatedAt: new Date('2026-09-13T00:00:00.000Z'),
    attachedAt: new Date('2026-09-13T00:00:00.000Z'),
    deletedAt: null,
    objectRemovedAt: null,
    ...overrides,
  } as MediaObjectEntity;
}

const VALID_ENV: Record<string, string> = {
  MEDIA_S3_ENDPOINT: 'http://minio.internal:9000',
  MEDIA_PUBLIC_BASE_URL: 'http://public.example.com',
  MEDIA_S3_REGION: 'us-east-1',
  MEDIA_S3_ACCESS_KEY: 'REDACTED',
  MEDIA_S3_SECRET_KEY: 'REDACTED',
  MEDIA_BUCKET_PUBLIC: 'erp-media-public',
  MEDIA_BUCKET_PRIVATE: 'erp-media-private',
};

const UUID_1 = '11111111-1111-1111-1111-111111111111';
const UUID_2 = '22222222-2222-2222-2222-222222222222';
const ORG_UUID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const OTHER_ORG_UUID = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';

describe('MediaQueryService', () => {
  let service: MediaQueryService;
  let repo: { createQueryBuilder: jest.Mock };
  let objectStorage: { signGetUrl: jest.Mock };
  let qb: FakeQb;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function build(
    rows: Partial<MediaObjectEntity>[] = [],
    env: Record<string, string | undefined> = VALID_ENV,
  ): Promise<void> {
    qb = makeQb(rows);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    objectStorage = { signGetUrl: jest.fn().mockResolvedValue('https://signed.example.com/x') };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaQueryService,
        { provide: getRepositoryToken(MediaObjectEntity), useValue: repo },
        { provide: ObjectStorageService, useValue: objectStorage },
        { provide: ConfigService, useValue: new ConfigService(env) },
      ],
    }).compile();
    service = module.get(MediaQueryService);
  }

  describe('listForOwners', () => {
    it('issues exactly one query for N owners, groups by owner and orders by sort_order then id', async () => {
      await build([
        row({ id: 'm-a0', ownerId: 'owner-a', sortOrder: 0 }),
        row({ id: 'm-a1', ownerId: 'owner-a', sortOrder: 1 }),
        row({ id: 'm-b0', ownerId: 'owner-b', sortOrder: 0 }),
      ]);

      const result = await service.listForOwners(
        MediaOwnerType.GOODS_RECEIPT,
        ['owner-a', 'owner-b', 'owner-c'],
        'org-1',
      );

      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(qb.where).toHaveBeenCalledWith('media.organizationId = :organizationId', {
        organizationId: 'org-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('media.ownerType = :ownerType', {
        ownerType: MediaOwnerType.GOODS_RECEIPT,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('media.ownerId = ANY(:ownerIds)', {
        ownerIds: ['owner-a', 'owner-b', 'owner-c'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('media.status = :status', {
        status: MediaStatus.ATTACHED,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('media.sortOrder', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('media.id', 'ASC');

      expect(result.get('owner-a')?.map((m) => m.id)).toEqual(['m-a0', 'm-a1']);
      expect(result.get('owner-b')?.map((m) => m.id)).toEqual(['m-b0']);
      expect(result.has('owner-c')).toBe(false);
    });

    it('returns an empty map without querying when ownerIds is empty', async () => {
      await build([]);

      const result = await service.listForOwners(MediaOwnerType.GOODS_RECEIPT, [], 'org-1');

      expect(result.size).toBe(0);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('filters status = ATTACHED at the query level, so DELETED media never appears', async () => {
      // The fake repo only ever returns what the query "found"; a DELETED row
      // is modelled by never appearing in that result set, which is what the
      // real WHERE status = 'ATTACHED' guarantees.
      await build([row({ id: 'm-1', ownerId: 'owner-a', status: MediaStatus.ATTACHED })]);

      const result = await service.listForOwners(MediaOwnerType.GOODS_RECEIPT, ['owner-a'], 'org-1');

      expect(qb.andWhere).toHaveBeenCalledWith('media.status = :status', {
        status: MediaStatus.ATTACHED,
      });
      expect(result.get('owner-a')?.map((m) => m.id)).toEqual(['m-1']);
    });

    it('maps every field of MediaSummary from the entity row', async () => {
      await build([
        row({
          id: 'm-1',
          ownerId: 'owner-a',
          ownerType: MediaOwnerType.GOODS_RECEIPT,
          fileName: 'hoa-don.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          sortOrder: 3,
          bucket: 'erp-media-private',
          objectKey: 'org/org-1/goods_receipt/m-1',
        }),
      ]);

      const result = await service.listForOwners(MediaOwnerType.GOODS_RECEIPT, ['owner-a'], 'org-1');

      const summary: MediaSummary | undefined = result.get('owner-a')?.[0];
      expect(summary).toEqual({
        id: 'm-1',
        fileName: 'hoa-don.pdf',
        contentType: 'application/pdf',
        size: 2048,
        sortOrder: 3,
        bucket: 'erp-media-private',
        objectKey: 'org/org-1/goods_receipt/m-1',
        ownerType: MediaOwnerType.GOODS_RECEIPT,
      });
    });
  });

  describe('toMediaSummary', () => {
    it('maps every entity field to MediaSummary (exported for T-04-01 to reuse)', () => {
      const entity = row({
        id: 'm-1',
        ownerType: MediaOwnerType.EMPLOYEE_PROFILE,
        fileName: 'anh-nhan-vien.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 555,
        sortOrder: 2,
        bucket: 'erp-media-private',
        objectKey: 'org/org-1/employee_profile/m-1',
      });

      expect(toMediaSummary(entity)).toEqual({
        id: 'm-1',
        fileName: 'anh-nhan-vien.jpg',
        contentType: 'image/jpeg',
        size: 555,
        sortOrder: 2,
        bucket: 'erp-media-private',
        objectKey: 'org/org-1/employee_profile/m-1',
        ownerType: MediaOwnerType.EMPLOYEE_PROFILE,
      });
    });
  });

  describe('resolvePublicUrls', () => {
    // Literal, not recomputed from MEDIA_OWNER_POLICIES: this pins the test to
    // today's actual public owner types instead of trivially agreeing with
    // whatever the production filter happens to compute.
    const PUBLIC_OWNER_TYPES = [MediaOwnerType.PRODUCT, MediaOwnerType.ITEM];

    it('issues exactly one query for N owners, scoped by organization/owner/status and ordered', async () => {
      await build([
        row({
          id: UUID_1,
          ownerId: 'owner-a',
          ownerType: MediaOwnerType.PRODUCT,
          fileName: 'anh-san-pham.jpg',
          sortOrder: 0,
          objectKey: `org/org-1/product/${UUID_1}`,
        }),
      ]);

      const result = await service.resolvePublicUrls(['owner-a', 'owner-b', 'owner-c'], 'org-1');

      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(qb.where).toHaveBeenCalledWith('media.organizationId = :organizationId', {
        organizationId: 'org-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('media.ownerId = ANY(:ownerIds)', {
        ownerIds: ['owner-a', 'owner-b', 'owner-c'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('media.status = :status', {
        status: MediaStatus.ATTACHED,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('media.sortOrder', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('media.id', 'ASC');

      expect(result.get('owner-a')).toEqual([
        { id: UUID_1, url: `http://public.example.com/erp-media-public/org/org-1/product/${UUID_1}`, fileName: 'anh-san-pham.jpg' },
      ]);
    });

    it('returns an empty map without querying when ownerIds is empty', async () => {
      await build([]);

      const result = await service.resolvePublicUrls([], 'org-1');

      expect(result.size).toBe(0);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('never returns a URL for a private-bucket owner id, because the query itself excludes it', async () => {
      // The private owner id's media never matches `ownerType = ANY(publicOwnerTypes)`,
      // so the fake repo — standing in for that filtered query — returns no row for it.
      await build([
        row({
          id: UUID_1,
          ownerId: 'owner-public',
          ownerType: MediaOwnerType.ITEM,
          objectKey: `org/org-1/item/${UUID_1}`,
        }),
      ]);

      const result = await service.resolvePublicUrls(['owner-public', 'owner-private'], 'org-1');

      expect(qb.andWhere).toHaveBeenCalledWith('media.ownerType = ANY(:ownerTypes)', {
        ownerTypes: PUBLIC_OWNER_TYPES,
      });
      expect(result.has('owner-private')).toBe(false);
      expect(result.get('owner-public')).toEqual([
        { id: UUID_1, url: `http://public.example.com/erp-media-public/org/org-1/item/${UUID_1}`, fileName: 'file.pdf' },
      ]);
    });

    it('orders URLs by sort_order then id', async () => {
      await build([
        row({
          id: UUID_1,
          ownerId: 'owner-a',
          ownerType: MediaOwnerType.PRODUCT,
          sortOrder: 0,
          objectKey: `org/org-1/product/${UUID_1}`,
        }),
        row({
          id: UUID_2,
          ownerId: 'owner-a',
          ownerType: MediaOwnerType.PRODUCT,
          sortOrder: 1,
          objectKey: `org/org-1/product/${UUID_2}`,
        }),
      ]);

      const result = await service.resolvePublicUrls(['owner-a'], 'org-1');

      expect(qb.orderBy).toHaveBeenCalledWith('media.sortOrder', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('media.id', 'ASC');
      expect(result.get('owner-a')?.map((m) => m.id)).toEqual([UUID_1, UUID_2]);
    });

    it('skips a row whose object_key does not match the expected shape, e.g. a ".." traversal attempt, and never logs the key', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await build([
        row({
          id: 'm-evil',
          ownerId: 'owner-a',
          ownerType: MediaOwnerType.PRODUCT,
          objectKey: 'org/org-1/product/../../../../erp-media-private/secret',
        }),
      ]);

      const result = await service.resolvePublicUrls(['owner-a'], 'org-1');

      expect(result.has('owner-a')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      const loggedText = warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(loggedText).not.toContain('erp-media-private/secret');
    });

    it('skips rows whose object_key belongs to a different organization, or has a non-public owner-type segment, even though they were returned by the query', async () => {
      await build([
        row({
          id: UUID_1,
          ownerId: 'owner-other-org',
          ownerType: MediaOwnerType.PRODUCT,
          objectKey: `org/${OTHER_ORG_UUID}/product/${UUID_1}`,
        }),
        row({
          id: UUID_2,
          ownerId: 'owner-wrong-segment',
          ownerType: MediaOwnerType.PRODUCT,
          objectKey: `org/org-1/goods_receipt/${UUID_2}`,
        }),
      ]);

      const result = await service.resolvePublicUrls(
        ['owner-other-org', 'owner-wrong-segment'],
        'org-1',
      );

      expect(result.has('owner-other-org')).toBe(false);
      expect(result.has('owner-wrong-segment')).toBe(false);
    });

    it('strips trailing slashes from MEDIA_PUBLIC_BASE_URL before building the URL', async () => {
      await build(
        [
          row({
            id: UUID_1,
            ownerId: 'owner-a',
            ownerType: MediaOwnerType.PRODUCT,
            objectKey: `org/org-1/product/${UUID_1}`,
          }),
        ],
        { ...VALID_ENV, MEDIA_PUBLIC_BASE_URL: 'http://public.example.com//' },
      );

      const result = await service.resolvePublicUrls(['owner-a'], 'org-1');

      expect(result.get('owner-a')?.[0]?.url).toBe(
        `http://public.example.com/erp-media-public/org/org-1/product/${UUID_1}`,
      );
    });

    it('resolves config before querying, and warns only once across repeated unconfigured calls (shared with publicUrlFor)', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await build([], { ...VALID_ENV, MEDIA_PUBLIC_BASE_URL: undefined });

      const first = await service.resolvePublicUrls(['owner-a'], 'org-1');
      const second = await service.resolvePublicUrls(['owner-a'], 'org-1');
      const third = service.publicUrlFor({
        id: UUID_1,
        fileName: 'anh-san-pham.jpg',
        contentType: 'image/jpeg',
        size: 1024,
        sortOrder: 0,
        bucket: 'erp-media-public',
        objectKey: `org/${ORG_UUID}/product/${UUID_1}`,
        ownerType: MediaOwnerType.PRODUCT,
      });

      expect(first.size).toBe(0);
      expect(second.size).toBe(0);
      expect(third).toBeNull();
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('publicUrlFor', () => {
    function publicSummary(overrides: Partial<MediaSummary> = {}): MediaSummary {
      return {
        id: UUID_1,
        fileName: 'anh-san-pham.jpg',
        contentType: 'image/jpeg',
        size: 1024,
        sortOrder: 0,
        bucket: 'erp-media-public',
        objectKey: `org/${ORG_UUID}/product/${UUID_1}`,
        ownerType: MediaOwnerType.PRODUCT,
        ...overrides,
      };
    }

    it('returns the public URL for a public-owner-type summary with a well-formed object_key', async () => {
      await build([]);

      const url = service.publicUrlFor(publicSummary());

      expect(url).toBe(`http://public.example.com/erp-media-public/org/${ORG_UUID}/product/${UUID_1}`);
    });

    it('returns null when the owner type is not public', async () => {
      await build([]);

      const url = service.publicUrlFor(
        publicSummary({ ownerType: MediaOwnerType.GOODS_RECEIPT, bucket: 'erp-media-private' }),
      );

      expect(url).toBeNull();
    });

    it('returns null when storage is not configured', async () => {
      await build([], { ...VALID_ENV, MEDIA_PUBLIC_BASE_URL: undefined });

      const url = service.publicUrlFor(publicSummary());

      expect(url).toBeNull();
    });

    it('returns null for a malformed/traversal-shaped object_key and does not log the key', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await build([]);

      const url = service.publicUrlFor(
        publicSummary({ objectKey: `org/${ORG_UUID}/product/../../../../erp-media-private/secret` }),
      );

      expect(url).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      const loggedText = warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(loggedText).not.toContain('erp-media-private/secret');
    });

    it('strips a trailing slash from MEDIA_PUBLIC_BASE_URL before building the URL', async () => {
      await build([], { ...VALID_ENV, MEDIA_PUBLIC_BASE_URL: 'http://public.example.com/' });

      const url = service.publicUrlFor(publicSummary());

      expect(url).toBe(`http://public.example.com/erp-media-public/org/${ORG_UUID}/product/${UUID_1}`);
    });
  });

  describe('signReadUrl', () => {
    const privateSummary: MediaSummary = {
      id: UUID_1,
      fileName: 'Hóa đơn nhà cung cấp.pdf',
      contentType: 'application/pdf',
      size: 1024,
      sortOrder: 0,
      bucket: 'erp-media-private',
      objectKey: `org/org-1/goods_receipt/${UUID_1}`,
      ownerType: MediaOwnerType.GOODS_RECEIPT,
    };

    it('signs an inline URL with a 1 hour TTL and forwards the original file name untouched, for an image', async () => {
      await build([]);
      const imageSummary: MediaSummary = { ...privateSummary, contentType: 'image/jpeg' };

      await service.signReadUrl(imageSummary, 'org-1', 'inline');

      expect(objectStorage.signGetUrl).toHaveBeenCalledWith(
        'erp-media-private',
        `org/org-1/goods_receipt/${UUID_1}`,
        60 * 60,
        { type: 'inline', fileName: 'Hóa đơn nhà cung cấp.pdf' },
      );
    });

    it('signs an attachment URL with a 15 minute TTL', async () => {
      await build([]);

      await service.signReadUrl(privateSummary, 'org-1', 'attachment');

      expect(objectStorage.signGetUrl).toHaveBeenCalledWith(
        'erp-media-private',
        `org/org-1/goods_receipt/${UUID_1}`,
        15 * 60,
        { type: 'attachment', fileName: 'Hóa đơn nhà cung cấp.pdf' },
      );
    });

    it('signs an inline request for a non-image (e.g. a PDF) as attachment instead', async () => {
      await build([]);

      await service.signReadUrl(privateSummary, 'org-1', 'inline');

      expect(objectStorage.signGetUrl).toHaveBeenCalledWith(
        'erp-media-private',
        `org/org-1/goods_receipt/${UUID_1}`,
        15 * 60,
        { type: 'attachment', fileName: 'Hóa đơn nhà cung cấp.pdf' },
      );
    });

    it('signs an inline request for image/svg+xml as attachment instead (SVG is script-capable)', async () => {
      await build([]);
      const svgSummary: MediaSummary = { ...privateSummary, contentType: 'image/svg+xml' };

      await service.signReadUrl(svgSummary, 'org-1', 'inline');

      expect(objectStorage.signGetUrl).toHaveBeenCalledWith(
        'erp-media-private',
        `org/org-1/goods_receipt/${UUID_1}`,
        15 * 60,
        { type: 'attachment', fileName: 'Hóa đơn nhà cung cấp.pdf' },
      );
    });

    it('keeps an inline request for an image inline', async () => {
      await build([]);
      const imageSummary: MediaSummary = { ...privateSummary, contentType: 'image/png' };

      await service.signReadUrl(imageSummary, 'org-1', 'inline');

      expect(objectStorage.signGetUrl).toHaveBeenCalledWith(
        'erp-media-private',
        `org/org-1/goods_receipt/${UUID_1}`,
        60 * 60,
        { type: 'inline', fileName: 'Hóa đơn nhà cung cấp.pdf' },
      );
    });

    it('throws 404 MEDIA_NOT_FOUND and never calls signGetUrl when the bucket is not the configured private bucket', async () => {
      await build([]);
      const wrongBucketSummary: MediaSummary = { ...privateSummary, bucket: 'some-other-bucket' };

      await expect(service.signReadUrl(wrongBucketSummary, 'org-1', 'attachment')).rejects.toMatchObject({
        status: 404,
        code: 'MEDIA_NOT_FOUND',
      });
      expect(objectStorage.signGetUrl).not.toHaveBeenCalled();
    });

    it('throws 404 MEDIA_NOT_FOUND and never calls signGetUrl when object_key belongs to a different organization', async () => {
      await build([]);
      const otherOrgSummary: MediaSummary = {
        ...privateSummary,
        objectKey: `org/other-org/goods_receipt/${UUID_1}`,
      };

      await expect(service.signReadUrl(otherOrgSummary, 'org-1', 'attachment')).rejects.toMatchObject({
        status: 404,
        code: 'MEDIA_NOT_FOUND',
      });
      expect(objectStorage.signGetUrl).not.toHaveBeenCalled();
    });

    it('throws 404 MEDIA_NOT_FOUND for an org id that merely starts with the actor\'s org id (org-10 vs org-1)', async () => {
      await build([]);
      const similarOrgSummary: MediaSummary = {
        ...privateSummary,
        objectKey: `org/org-10/goods_receipt/${UUID_2}`,
      };

      await expect(service.signReadUrl(similarOrgSummary, 'org-1', 'attachment')).rejects.toMatchObject({
        status: 404,
        code: 'MEDIA_NOT_FOUND',
      });
      expect(objectStorage.signGetUrl).not.toHaveBeenCalled();
    });

    it('throws 404 MEDIA_NOT_FOUND for a ".." segment-injection attempt after the organization prefix', async () => {
      await build([]);
      const traversalSummary: MediaSummary = {
        ...privateSummary,
        objectKey: `org/org-1/../org-10/goods_receipt/${UUID_2}`,
      };

      await expect(service.signReadUrl(traversalSummary, 'org-1', 'attachment')).rejects.toMatchObject({
        status: 404,
        code: 'MEDIA_NOT_FOUND',
      });
      expect(objectStorage.signGetUrl).not.toHaveBeenCalled();
    });

    it('throws 503 STORAGE_UNAVAILABLE and never calls signGetUrl when storage is not configured', async () => {
      await build([], { ...VALID_ENV, MEDIA_S3_ENDPOINT: undefined });

      await expect(service.signReadUrl(privateSummary, 'org-1', 'attachment')).rejects.toMatchObject({
        status: 503,
        code: 'STORAGE_UNAVAILABLE',
      });
      expect(objectStorage.signGetUrl).not.toHaveBeenCalled();
    });
  });
});
