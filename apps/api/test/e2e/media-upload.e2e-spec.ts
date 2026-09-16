import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
  fakeObjectStorage,
} from './setup/test-app';
import { createUserWithPermissions, ScopedTestUser } from './setup/checkout-saga-fixture';
import { MediaException } from '../../src/modules/media/media.exception';

/**
 * T-01-11 — proves the upload-ticket / complete flow end to end against
 * `FakeObjectStorageService`, so this suite stays green with MinIO stopped
 * (`fakeObjectStorage` overrides `ObjectStorageService` in `createTestApp()`).
 *
 * Uses `EMPLOYEE_PROFILE` throughout (AC-12's own scenario: "given tôi không
 * có quyền sửa hồ sơ nhân viên"), not the `PRODUCT`/`inventory.write` example
 * in this ticket's Implementation notes — that pairing exercises a different
 * ownerType than AC-12 is written against and would not actually verify it.
 */
describe('Media upload (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let limitedUser: ScopedTestUser;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // Holds `iam.user.read` but not `iam.user.write` — the permission
    // MEDIA_OWNER_POLICIES[EMPLOYEE_PROFILE] requires to write — so requesting
    // an upload ticket for an employee photo must be refused (AC-12).
    limitedUser = await createUserWithPermissions(app, seed, ['iam.user.read']);
  });

  afterAll(async () => {
    await app.close();
  });

  const adminHeaders = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  it('AC-12: rejects an EMPLOYEE_PROFILE upload ticket for a user without iam.user.write', async () => {
    const res = await request(app.getHttpServer())
      .post('/media/uploads')
      .set(limitedUser.headers())
      .send({
        ownerType: 'EMPLOYEE_PROFILE',
        fileName: 'anh-nhan-vien.jpg',
        contentType: 'image/jpeg',
        size: 1024,
      })
      .expect(403);

    expect(res.body.message).toMatch(/permission/i);

    const rows = await ds.query('SELECT count(*)::int AS c FROM media_objects WHERE created_by = $1', [
      limitedUser.userId,
    ]);
    expect(rows[0].c).toBe(0);
  });

  it('issues an upload ticket with a presigned-post policy for the admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/media/uploads')
      .set(adminHeaders())
      .send({
        ownerType: 'EMPLOYEE_PROFILE',
        fileName: 'anh-nhan-vien.jpg',
        contentType: 'image/jpeg',
        size: 1024,
      })
      .expect(201);

    expect(res.body.mediaId).toBeDefined();
    expect(res.body.upload.url).toBeDefined();
    expect(res.body.upload.fields.key).toBeDefined();
  });

  it('AC-19: returns 503 STORAGE_UNAVAILABLE (top-level code) when storage is unreachable', async () => {
    fakeObjectStorage.failWith = new MediaException(503, 'STORAGE_UNAVAILABLE', 'Object storage is unreachable');
    try {
      const res = await request(app.getHttpServer())
        .post('/media/uploads')
        .set(adminHeaders())
        .send({
          ownerType: 'EMPLOYEE_PROFILE',
          fileName: 'anh-storage-down.jpg',
          contentType: 'image/jpeg',
          size: 1024,
        })
        .expect(503);

      expect(res.body.code).toBe('STORAGE_UNAVAILABLE');
    } finally {
      fakeObjectStorage.failWith = null;
    }
  });

  describe('completing an upload', () => {
    it('returns 400 MEDIA_INVALID (top-level code) when the stored object does not match the ticket', async () => {
      const ticketRes = await request(app.getHttpServer())
        .post('/media/uploads')
        .set(adminHeaders())
        .send({
          ownerType: 'EMPLOYEE_PROFILE',
          fileName: 'anh-sai-kich-thuoc.jpg',
          contentType: 'image/jpeg',
          size: 1024,
        })
        .expect(201);

      const mediaId = ticketRes.body.mediaId;
      const objectKey = ticketRes.body.upload.fields.key;

      // Declared size was 1024; the "uploaded" object is a different size.
      fakeObjectStorage.putFake(objectKey, 999, 'image/jpeg');

      const res = await request(app.getHttpServer())
        .post(`/media/uploads/${mediaId}/complete`)
        .set(adminHeaders())
        .expect(400);

      expect(res.body.code).toBe('MEDIA_INVALID');
      expect(res.body.details?.code).toBeUndefined();

      const head = await fakeObjectStorage.headObject('unused', objectKey);
      expect(head).toBeNull();
    });

    it('returns 200 UPLOADED when the stored object matches the declared size and type', async () => {
      const ticketRes = await request(app.getHttpServer())
        .post('/media/uploads')
        .set(adminHeaders())
        .send({
          ownerType: 'EMPLOYEE_PROFILE',
          fileName: 'anh-dung-kich-thuoc.jpg',
          contentType: 'image/jpeg',
          size: 2048,
        })
        .expect(201);

      const mediaId = ticketRes.body.mediaId;
      const objectKey = ticketRes.body.upload.fields.key;

      fakeObjectStorage.putFake(objectKey, 2048, 'image/jpeg');

      const res = await request(app.getHttpServer())
        .post(`/media/uploads/${mediaId}/complete`)
        .set(adminHeaders())
        .expect(200);

      expect(res.body.mediaId).toBe(mediaId);
      expect(res.body.status).toBe('UPLOADED');
    });
  });
});
