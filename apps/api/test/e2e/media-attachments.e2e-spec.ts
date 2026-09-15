import { randomUUID } from 'crypto';
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
import { createUserWithPermissions } from './setup/checkout-saga-fixture';
import { CoaSeederService } from '../../src/modules/accounting/seeders/coa-seeder.service';
import { DefaultAccountSeederService } from '../../src/modules/accounting/seeders/default-account.seeder';
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * T-04-09 (AC-13, AC-15, AC-16) — proves the attach/download contract over real
 * HTTP, with `fakeObjectStorage` standing in for MinIO (T-01-11): a real file
 * checksum round-trip (AC-13's own wording) only happens in the MinIO demo,
 * not here — this suite instead pins the parts a fake storage backend *can*
 * prove: the attachment's name/size survive the write, the download link
 * carries `Cache-Control: no-store` and `disposition=attachment`, a reader
 * without the owner voucher's read permission is refused, and a REVERSED
 * voucher's attachments cannot be edited (A-26).
 *
 * Case 1 was written against AC-13's "phiếu nháp" (DRAFT) setup via
 * `POST /v2/goods-receipts` (the only HTTP-reachable draft-only create —
 * the version-neutral `POST /goods-receipts` always calls `createAndPost`).
 * That v2 handler passes `this.dataSource.manager` — not a transaction — into
 * `DocumentNumberingService.generate()`, which does a `SELECT ... FOR UPDATE`
 * that requires an open transaction; every call 500s with
 * `PessimisticLockTransactionRequiredError` (reproduced 2026-09-14, see
 * `create-goods-receipt-v2.handler.ts` around the `documentNumbering.generate`
 * call). Filing that as a bug rather than fixing it here — it is outside this
 * ticket's `touches:` (this spec file only). Case 1 instead goes through
 * `POST /goods-receipts` (`createAndPost`), which posts synchronously and
 * leaves the receipt POSTED rather than DRAFT; a POSTED goods receipt is
 * still freely editable (AC-16's own first scenario), so the attach/read/
 * download assertions this case actually makes still hold.
 */
describe('Voucher attachments — download by permission, reversed lock (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function grantPermissions(keys: string[]): Promise<void> {
    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    for (const key of keys) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'e2e-media-attachments') ON CONFLICT DO NOTHING`,
        [key],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, key],
      );
    }
  }

  async function uploadAndComplete(
    hdrs: Record<string, string>,
    ownerType: 'GOODS_RECEIPT' | 'CASH_RECEIPT',
    fileName: string,
    contentType: string,
    size: number,
  ): Promise<string> {
    const ticketRes = await request(app.getHttpServer())
      .post('/media/uploads')
      .set(hdrs)
      .send({ ownerType, fileName, contentType, size })
      .expect(201);

    const mediaId: string = ticketRes.body.mediaId;
    const objectKey: string = ticketRes.body.upload.fields.key;
    fakeObjectStorage.putFake(objectKey, size, contentType);

    await request(app.getHttpServer())
      .post(`/media/uploads/${mediaId}/complete`)
      .set(hdrs)
      .expect(200);

    return mediaId;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // Neither goods_receipt.* nor accounting.cash_receipt.* are in
    // seedBaseData's default permission set (goods-receipt-batch-import.e2e-spec.ts
    // notes the same for goods_receipt.*; cash-vouchers-phase1.e2e-spec.ts does
    // the same for cash_receipt.*).
    await grantPermissions([
      'goods_receipt.read',
      'goods_receipt.write',
      'goods_receipt.post',
      'goods_receipt.other-receipt',
      'accounting.cash_receipt.create',
      'accounting.cash_receipt.read',
      'accounting.cash_receipt.update',
      'accounting.cash_receipt.reverse',
    ]);

    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);
    await app
      .get(DefaultAccountSeederService)
      .seedForOrganization(seed.organizationId, seed.userId);
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);
  }, 120000);

  afterAll(async () => {
    // Bound app.close(): kafkajs consumer teardown can hang against Redpanda and
    // would otherwise trip the hook timeout and report a fake "suite failed".
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('Case 1 — goods receipt: attach, read back, download', () => {
    let locationId: string;
    let itemId: string;

    beforeAll(async () => {
      const storageRes = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'GR Attachments WH', branchId: seed.branchId })
        .expect(201);

      const locRes = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({
          code: 'GR-ATT-LOC',
          type: 'SHELF',
          name: 'GR Attachments Loc',
          storageId: storageRes.body.id,
          branchId: seed.branchId,
        })
        .expect(201);
      locationId = locRes.body.id;

      const itemRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          code: 'GR-ATT-ITEM',
          name: 'GR Attachments Item',
          unit: 'PCS',
          purchasePrice: 10000,
          sellingPrice: 20000,
        })
        .expect(201);
      itemId = itemRes.body.id;
    });

    it('AC-13/AC-15: attaches a file to a goods receipt, reads it back, and downloads it', async () => {
      const fileSize = 3 * 1024 * 1024;
      const mediaId = await uploadAndComplete(
        headers(),
        'GOODS_RECEIPT',
        'hop-dong-nhap-kho.pdf',
        'application/pdf',
        fileSize,
      );

      // `POST /goods-receipts` (createAndPost), not the v2 draft-only create —
      // see the file-level comment: the v2 endpoint 500s today.
      const createRes = await request(app.getHttpServer())
        .post('/goods-receipts')
        .set(headers())
        .send({
          purpose: 'OTHER',
          receivedAt: '2026-09-14T00:00:00.000Z',
          locationId,
          lines: [{ itemId, locationId, uomCode: 'PCS', quantity: 1, unitPrice: 10000 }],
          attachmentIds: [mediaId],
        })
        .expect(201);
      const receiptId: string = createRes.body.id;

      const detailRes = await request(app.getHttpServer())
        .get(`/goods-receipts/${receiptId}`)
        .set(headers())
        .expect(200);
      expect(detailRes.body.status).toBe('POSTED');
      expect(detailRes.body.attachments).toHaveLength(1);
      expect(detailRes.body.attachments[0]).toMatchObject({
        id: mediaId,
        fileName: 'hop-dong-nhap-kho.pdf',
        size: fileSize,
      });

      const downloadRes = await request(app.getHttpServer())
        .get(`/media/${mediaId}/download-url`)
        .set(headers())
        .expect(200);
      expect(downloadRes.headers['cache-control']).toBe('no-store');
      expect(downloadRes.body.expiresAt).toBeTruthy();
      expect(downloadRes.body.url).toContain('disposition=attachment');
    });
  });

  describe('Case 2 & 3 — cash receipt: read permission and reversed-voucher lock', () => {
    let cashAccountId: string;
    let revenueAccountId: string;

    const accountByCode = async (code: string): Promise<string> => {
      const rows = await ds.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
        [seed.organizationId, code],
      );
      return rows[0].id;
    };

    beforeAll(async () => {
      const cashGlId = await accountByCode('1111');
      revenueAccountId = await accountByCode('511');

      const accRes = await request(app.getHttpServer())
        .post('/cash/accounts')
        .set(headers())
        .send({ name: 'Quỹ Media E2E', type: 'REGISTER', accountId: cashGlId, balance: 0 })
        .expect(201);
      cashAccountId = accRes.body.id;
    });

    it('AC-15: a user without accounting.cash_receipt.read gets 403 with Cache-Control: no-store', async () => {
      const mediaId = await uploadAndComplete(
        headers(),
        'CASH_RECEIPT',
        'bien-lai-thu-tien.jpg',
        'image/jpeg',
        2048,
      );
      await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-09-14',
          cashAccountId,
          contraAccountId: revenueAccountId,
          totalAmount: 500000,
          lines: [{ description: 'Thu bán hàng', amount: 500000 }],
          attachmentIds: [mediaId],
        })
        .expect(201);

      // Holds no permissions at all — in particular not
      // accounting.cash_receipt.read, which MEDIA_OWNER_POLICIES[CASH_RECEIPT]
      // requires to read this media.
      const limitedUser = await createUserWithPermissions(app, seed, []);

      const res = await request(app.getHttpServer())
        .get(`/media/${mediaId}/download-url`)
        .set(limitedUser.headers())
        .expect(403);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('AC-16: a REVERSED receipt rejects an attachmentIds edit and keeps its attachments', async () => {
      const mediaId = await uploadAndComplete(
        headers(),
        'CASH_RECEIPT',
        'bien-lai-truoc-dao.jpg',
        'image/jpeg',
        4096,
      );
      const createRes = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-09-14',
          cashAccountId,
          contraAccountId: revenueAccountId,
          totalAmount: 250000,
          lines: [{ description: 'Thu bán hàng', amount: 250000 }],
          attachmentIds: [mediaId],
        })
        .expect(201);
      const receiptId: string = createRes.body.id;
      const revision: number = createRes.body.revision;

      await request(app.getHttpServer())
        .post(`/cash-receipts/${receiptId}/reverse`)
        .set(headers())
        .send({ reason: 'Khách trả lại E2E' })
        .expect(201)
        .expect((res) => {
          if (res.body.original.status !== 'REVERSED') {
            throw new Error(`expected original.status REVERSED, got ${res.body.original.status}`);
          }
        });

      // Same rejection every other edit of a REVERSED voucher gets today
      // (editable-voucher.util.ts assertEditable → ConflictException → the
      // shared HttpExceptionFilter's fallback code `HTTP_409`, since
      // ConflictException carries no explicit `.code`).
      const editRes = await request(app.getHttpServer())
        .patch(`/cash-receipts/${receiptId}`)
        .set(headers())
        .send({ revision, attachmentIds: [randomUUID()] })
        .expect(409);
      expect(editRes.body.code).toBe('HTTP_409');
      expect(editRes.body.message).toMatch(/đã được đảo bút/);

      const detailRes = await request(app.getHttpServer())
        .get(`/cash-receipts/${receiptId}`)
        .set(headers())
        .expect(200);
      expect(detailRes.body.attachments).toHaveLength(1);
      expect(detailRes.body.attachments[0].id).toBe(mediaId);
    });
  });
});
