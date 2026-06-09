import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * "Lập từ lệnh điều chuyển" (EPIC-08062026): the goods-issue form picks a DRAFT
 * transfer order and Save performs the two-phase export with the form's lines.
 * Runs same-branch (source == destination) so one seeded token satisfies the
 * source-branch export guard, mirroring transfer-order.e2e-spec.ts.
 */
describe('Goods issue from transfer order (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  let itemId: string;
  let srcStorageId: string;
  let srcLocationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'IFT-ITEM',
        name: 'Issue-From-Transfer Item',
        unit: 'PCS',
        purchasePrice: 7,
        sellingPrice: 20,
      })
      .expect(201);
    itemId = item.body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'IFT Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    const locs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${srcStorageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    srcLocationId = locs.body.data[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  function createVoucher() {
    return request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: seed.branchId,
        sourceStorageId: srcStorageId,
        notes: 'IFT e2e',
        lines: [{ itemId, requestedQty: 5, sourceStorageId: srcStorageId }],
      });
  }

  function issuable() {
    return request(app.getHttpServer())
      .get('/inventory/transfer-orders/issuable')
      .set(headers());
  }

  it('lists a DRAFT voucher in the issuable picker with the destination branch name inlined', async () => {
    const created = await createVoucher().expect(201);
    const res = await issuable().expect(200);
    const row = (res.body as Array<{ id: string }>).find(
      (r) => r.id === created.body.id,
    ) as
      | { id: string; status: string; destinationBranchId: string; destinationBranchName: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.status).toBe('DRAFT');
    expect(row!.destinationBranchId).toBe(seed.branchId);
    expect(typeof row!.destinationBranchName).toBe('string');
    expect(row!.destinationBranchName.length).toBeGreaterThan(0);
  });

  it('exports with the form-submitted lines → IN_PROGRESS, goods issue stamped with the TRANSFER_ORDER reference', async () => {
    const created = await createVoucher().expect(201);

    const exported = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set(headers())
      .send({
        notes: 'Issued from form',
        // Edited quantity (3 < requested 5), with the resolved source location.
        lines: [{ itemId, locationId: srcLocationId, quantity: 3, unitPrice: 7 }],
      })
      .expect(201);

    expect(exported.body.status).toBe('IN_PROGRESS');
    const giId = exported.body.exportGoodsIssueId;
    expect(giId).toBeTruthy();

    const gi = await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${giId}`)
      .set(headers())
      .expect(200);
    expect(gi.body.purpose).toBe('TRANSFER_OUT');
    expect(gi.body.referenceType).toBe('TRANSFER_ORDER');
    expect(gi.body.referenceId).toBe(created.body.id);
    expect(gi.body.targetBranchId).toBe(seed.branchId);
    expect(Number(gi.body.lines[0].quantity)).toBe(3);

    // The exported voucher must drop out of the issuable picker.
    const after = await issuable().expect(200);
    expect(
      (after.body as Array<{ id: string }>).some((r) => r.id === created.body.id),
    ).toBe(false);
  });

  it('rejects an edited line whose item is not on the transfer order', async () => {
    const created = await createVoucher().expect(201);
    await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set(headers())
      .send({
        lines: [
          {
            itemId: 'a0000000-0000-4000-8000-0000000000ff',
            locationId: srcLocationId,
            quantity: 1,
          },
        ],
      })
      .expect(400);
  });

  it('replays an idempotent export without creating a second goods issue', async () => {
    const created = await createVoucher().expect(201);
    const key = `ift-export-${created.body.id}`;
    const body = {
      lines: [{ itemId, locationId: srcLocationId, quantity: 2, unitPrice: 7 }],
    };

    const first = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set({ ...headers(), 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set({ ...headers(), 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    // Same goods issue id on replay — the second call did not export again.
    expect(replay.body.exportGoodsIssueId).toBe(first.body.exportGoodsIssueId);
  });
});
