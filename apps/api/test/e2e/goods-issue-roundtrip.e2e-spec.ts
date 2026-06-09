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
 * EPIC-08062026 round-trip: a goods issue must persist and return the fields the
 * form collects — deliverer (Người giao), references[] (Tham chiếu), occurredAt
 * (Ngày/Giờ xuất) — and each line must carry its own location (Kho/Vị trí) on
 * both the detail read (getById) and the v2 search list.
 */
describe('Goods issue field round-trip (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  let itemId: string;
  let storageId: string;
  let locationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'GIR-ITEM',
        name: 'Round-trip item',
        unit: 'PCS',
        purchasePrice: 10,
        sellingPrice: 20,
      })
      .expect(201);
    itemId = item.body.id;

    const st = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'GIR WH', branchId: seed.branchId })
      .expect(201);
    storageId = st.body.id;

    const locs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${storageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    locationId = locs.body.data[0].id;
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

  it('persists deliverer / references / occurredAt and returns them + per-line location', async () => {
    const occurredAt = '2026-06-08T14:41:00.000Z';

    const created = await request(app.getHttpServer())
      .post('/inventory/goods-issues')
      .set(headers())
      .send({
        locationId,
        purpose: 'OTHER',
        notes: 'round-trip',
        deliverer: 'Nguyễn Văn A',
        references: ['R-1', 'R-2'],
        occurredAt,
        lines: [{ itemId, locationId, quantity: 1, unitPrice: 350000 }],
      })
      .expect(201);
    const id = created.body.id as string;

    // Detail read (view dialog path).
    const gi = await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${id}`)
      .set(headers())
      .expect(200);
    expect(gi.body.deliverer).toBe('Nguyễn Văn A');
    expect(gi.body.references).toEqual(['R-1', 'R-2']);
    expect(new Date(gi.body.occurredAt).toISOString()).toBe(occurredAt);
    expect(gi.body.lines[0].location.id).toBe(locationId);
    expect(gi.body.lines[0].location.storageId).toBe(storageId);

    // v2 search list path — the fix that makes Kho/Vị trí load in the list/view.
    const search = await request(app.getHttpServer())
      .post('/v2/inventory/goods-issues/search')
      .set(headers())
      .send({})
      .expect(201);
    const row = (search.body.data as Array<{ id: string }>).find(
      (r) => r.id === id,
    ) as
      | { deliverer: string; lines: Array<{ location?: { id: string } }> }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.deliverer).toBe('Nguyễn Văn A');
    expect(row!.lines[0].location?.id).toBe(locationId);
  });

  it('defaults references to [] and leaves deliverer/occurredAt null when omitted', async () => {
    const created = await request(app.getHttpServer())
      .post('/inventory/goods-issues')
      .set(headers())
      .send({
        locationId,
        purpose: 'OTHER',
        lines: [{ itemId, locationId, quantity: 1 }],
      })
      .expect(201);

    const gi = await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${created.body.id}`)
      .set(headers())
      .expect(200);
    expect(gi.body.references).toEqual([]);
    expect(gi.body.deliverer == null).toBe(true);
    expect(gi.body.occurredAt == null).toBe(true);
  });
});
