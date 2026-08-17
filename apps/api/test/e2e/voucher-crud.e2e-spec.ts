import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  authHeader,
  createTestApp,
  request,
  resetDatabase,
  seedBaseData,
  type SeedResult,
} from './setup/test-app';
import { seedPromotionFixtures } from './setup/promotion-seed';

/**
 * AC-24 plus the voucher half of AC-17 and AC-19.
 *
 * Vouchers predate this epic — `VoucherService` is the legacy layer ADR-04
 * leaves in place, wrapped in a v2 search handler. These tests pin the two
 * seams that produced real defects during construction: the search projection
 * dropping the row `id` (A-30) and `deactivate` flipping only the legacy
 * `isActive` flag while the screen reads `status` (A-31).
 *
 * The v2 controller exposes no `GET /:id`, so state is read back through
 * `POST /v2/vouchers/search` — the same path the screen uses.
 */
describe('Vouchers — CRUD (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;

  const post = (path: string, body: unknown) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', authHeader(base.accessToken))
      .send(body as object);

  /** Filters sit at the top level of the DTO, not under a `filters` key. */
  const search = (body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/v2/vouchers/search')
      .set('Authorization', authHeader(base.accessToken))
      .send(body);

  const byCode = async (code: string) => {
    const res = await search({ code: { operator: '=', value: code } }).expect(201);
    return res.body;
  };

  const voucherBody = (code: string, overrides: Record<string, unknown> = {}) => ({
    code,
    issuer: 'Công ty ABC',
    faceValue: 500_000,
    description: 'Voucher khai trương',
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    await seedPromotionFixtures(app, base);
    // Booting AppModule wires every Kafka consumer; measured at ~130s locally.
  }, 300_000);

  // Closing the app disconnects every Kafka consumer one by one; the default
  // 30s hook timeout expires mid-teardown and Jest reports it as a suite failure
  // even when all tests passed.
  afterAll(async () => {
    await app?.close();
  }, 120_000);

  it('AC-24: a duplicate code is a 409, not a second row', async () => {
    await post('/v2/vouchers', voucherBody('VC-E2E-001')).expect(201);

    const conflict = await post('/v2/vouchers', voucherBody('VC-E2E-001')).expect(409);
    expect(conflict.body.message).toContain('VC-E2E-001');

    expect((await byCode('VC-E2E-001')).data).toHaveLength(1);
  });

  it('A-30: every search row carries its own id, so the row is actionable', async () => {
    const created = await post('/v2/vouchers', voucherBody('VC-E2E-002')).expect(201);

    const found = await byCode('VC-E2E-002');

    expect(found.data[0].id).toBe(created.body.id);
    // Without this the Sửa / Nhân bản / Ngừng theo dõi buttons address nothing.
    expect(found.data.every((r: any) => typeof r.id === 'string' && r.id.length > 0)).toBe(true);
  });

  it('A-31: ngừng theo dõi stops the voucher at the till *and* on the screen', async () => {
    const created = await post('/v2/vouchers', voucherBody('VC-E2E-003')).expect(201);

    await request(app.getHttpServer())
      .delete(`/v2/vouchers/${created.body.id}`)
      .set('Authorization', authHeader(base.accessToken))
      .expect(200);

    // What the screen reads.
    expect((await byCode('VC-E2E-003')).data[0].status).toBe('STOPPED');

    // What the till reads — `isActive` is not projected into the search row, so
    // it has to come from the table. Flipping only one of the two is the defect
    // A-31 records: the badge kept saying "Đang theo dõi" for a dead voucher.
    const [row] = await app
      .get(DataSource)
      .query('SELECT is_active FROM vouchers WHERE id = $1::uuid', [created.body.id]);
    expect(row.is_active).toBe(false);
  });

  it('editing writes through to what the list shows', async () => {
    const created = await post('/v2/vouchers', voucherBody('VC-E2E-006')).expect(201);

    await request(app.getHttpServer())
      .put(`/v2/vouchers/${created.body.id}`)
      .set('Authorization', authHeader(base.accessToken))
      .send({ issuer: 'Công ty XYZ', faceValue: 750_000, description: 'Đã sửa' })
      .expect(200);

    const row = (await byCode('VC-E2E-006')).data[0];
    expect(row.issuer).toBe('Công ty XYZ');
    expect(Number(row.faceValue)).toBe(750_000);
    expect(row.description).toBe('Đã sửa');
  });

  it('leaving both dates empty is valid — an unlimited voucher', async () => {
    const created = await post(
      '/v2/vouchers',
      voucherBody('VC-E2E-007', { validFrom: undefined, validTo: undefined }),
    ).expect(201);

    expect(created.body.validFrom ?? null).toBeNull();
    expect(created.body.validTo ?? null).toBeNull();

    // A-29 in the voucher half: a null-dated row must survive a period filter.
    const row = (await byCode('VC-E2E-007')).data[0];
    expect(row).toBeDefined();
    expect(row.startDate ?? null).toBeNull();
    expect(row.endDate ?? null).toBeNull();
  });

  it('duplicating carries the configuration over under a new code', async () => {
    const created = await post('/v2/vouchers', voucherBody('VC-E2E-005')).expect(201);

    const copy = await post(`/v2/vouchers/${created.body.id}/duplicate`, {
      code: 'VC-E2E-005-COPY',
    }).expect(201);

    expect(copy.body.id).not.toBe(created.body.id);
    expect(copy.body.issuer).toBe('Công ty ABC');
    expect(Number(copy.body.faceValue)).toBe(500_000);
    expect(copy.body.isUsed).toBe(false);

    await post(`/v2/vouchers/${created.body.id}/duplicate`, { code: 'VC-E2E-005-COPY' })
      .expect(409);
  });

  it('the total row sums over the whole filtered set, not the current page', async () => {
    for (const code of ['VC-SUM-1', 'VC-SUM-2', 'VC-SUM-3']) {
      await post(
        '/v2/vouchers',
        voucherBody(code, { faceValue: 100_000, issuer: 'Bên phát hành SUM' }),
      ).expect(201);
    }

    const res = await search({
      issuer: { operator: '*', value: 'SUM' },
      page: 1,
      limit: 2,
    }).expect(201);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(Number(res.body.summary.totalVoucherValue)).toBe(300_000);
    expect(res.body.summary.totalQuantity).toBe(3);
  });

  it('AC-17: an id outside the organization is a 404, and no token at all is a 401', async () => {
    const foreignId = '99999999-0000-4000-8000-000000000001';

    await request(app.getHttpServer())
      .put(`/v2/vouchers/${foreignId}`)
      .set('Authorization', authHeader(base.accessToken))
      .send({ issuer: 'Ai đó' })
      .expect(404);

    await request(app.getHttpServer()).post('/v2/vouchers/search').send({}).expect(401);
  });

  it('AC-19: replaying an idempotency key returns the first response, not a second voucher', async () => {
    // The key must be unique per run. `IdempotencyStore` lives in Redis, which
    // `resetDatabase` does not touch, so a fixed key replays the *previous*
    // run's stored 201 — the assertions below all pass while nothing is written.
    const key = `e2e-voucher-idem-${Date.now()}`;
    const body = voucherBody('VC-E2E-IDEM');

    const first = await request(app.getHttpServer())
      .post('/v2/vouchers')
      .set('Authorization', authHeader(base.accessToken))
      .set('X-Idempotency-Key', key)
      .send(body)
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/v2/vouchers')
      .set('Authorization', authHeader(base.accessToken))
      .set('X-Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(replay.body.id).toBe(first.body.id);
    expect(replay.headers['x-idempotency-status']).toBe('REPLAYED');

    // Same key, different body — a replay would silently return the wrong voucher.
    await request(app.getHttpServer())
      .post('/v2/vouchers')
      .set('Authorization', authHeader(base.accessToken))
      .set('X-Idempotency-Key', key)
      .send(voucherBody('VC-E2E-IDEM-OTHER'))
      .expect(409);

    expect((await byCode('VC-E2E-IDEM')).data).toHaveLength(1);
    expect((await byCode('VC-E2E-IDEM-OTHER')).data).toHaveLength(0);
  });
});
