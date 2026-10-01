import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * GET /customers/:id/point-history (2026100101 T-01-03, AC-10/AC-11): newest first, with the
 * invoice code and the actor's name, behind `customer.points.history.read`.
 */
describe('Customer point history (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;
  let readerToken: string;
  let customerId: string;
  let cardId: string;

  const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
  const readerRoleId = 'd0000000-0000-4000-8000-0000000004b1';
  const invoiceId = 'e0000000-0000-4000-8000-0000000004c1';

  const grantKeys = async (roleId: string, keys: string[]) => {
    for (const key of keys) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'customer') ON CONFLICT DO NOTHING`,
        [key],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, key],
      );
    }
  };

  function headers(token = seed.accessToken) {
    return { Authorization: authHeader(token), 'X-Branch-Id': seed.branchId };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    await grantKeys(SEEDED_ROLE_ID, ['customer.points.adjust', 'customer.points.history.read']);
    await app.get(RbacService).invalidateUserPermissions(seed.userId, seed.organizationId);

    // Reader: customer.read but not customer.points.history.read (AC-11).
    await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({ email: 'history-reader@test.com', firstName: 'Reader', lastName: 'History', temporaryPassword: 'password123' })
      .expect(201);
    const [{ id: readerId }] = await ds.query(`SELECT id FROM users WHERE email = 'history-reader@test.com'`);
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Chỉ xem KH', null, NOW(), NOW())`,
      [readerRoleId, seed.organizationId],
    );
    await grantKeys(readerRoleId, ['customer.read']);
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
      [readerId, readerRoleId, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
      [readerId, seed.branchId, seed.organizationId],
    );
    readerToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'history-reader@test.com', password: 'password123', organizationId: seed.organizationId })
        .expect(200)
    ).body.accessToken;

    // Customer (card auto-issued) with three ledger rows: earn from HD0001, redeem, adjust.
    customerId = (await request(app.getHttpServer()).post('/customers').set(headers()).send({ name: 'Lịch sử điểm' }).expect(201))
      .body.id;
    cardId = (await request(app.getHttpServer()).get(`/customers/${customerId}/membership-card`).set(headers()).expect(200)).body.id;
    await ds.query(
      `INSERT INTO invoices (id, organization_id, branch_id, code, session_id, staff_id, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, 'HD0001', 'session-x', $4::uuid, $4, NOW(), NOW())`,
      [invoiceId, seed.organizationId, seed.branchId, seed.userId],
    );
    const ledger = (type: string, delta: number, minutesAgo: number, invoice: string | null, note: string) =>
      ds.query(
        `INSERT INTO point_history (id, organization_id, card_id, invoice_id, type, delta, note, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, $6, $7, NOW() - ($8 || ' minutes')::interval, NOW())`,
        [seed.organizationId, cardId, invoice, type, delta, note, seed.userId, minutesAgo],
      );
    await ledger('earn', 100, 30, invoiceId, 'Tích điểm');
    await ledger('redeem', -20, 20, null, 'Dùng điểm');
    await ledger('adjust', 5, 10, null, 'Bù điểm');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists the ledger newest first with invoice code and actor name (AC-10)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/customers/${customerId}/point-history`)
      .query({ page: 1, limit: 20 })
      .set(headers())
      .expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.data.map((r: { type: string }) => r.type)).toEqual(['adjust', 'redeem', 'earn']);
    const [{ first_name, last_name }] = await ds.query(`SELECT first_name, last_name FROM users WHERE id = $1::uuid`, [
      seed.userId,
    ]);
    expect(res.body.data[2]).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
      type: 'earn',
      delta: 100,
      invoiceId,
      invoiceCode: 'HD0001',
      note: 'Tích điểm',
      createdByName: `${first_name} ${last_name}`.trim(),
    });
    expect(res.body.data[1]).toMatchObject({ delta: -20, invoiceId: null, invoiceCode: null });
  });

  it('paginates', async () => {
    const res = await request(app.getHttpServer())
      .get(`/customers/${customerId}/point-history`)
      .query({ page: 2, limit: 2 })
      .set(headers())
      .expect(200);
    expect(res.body).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(res.body.data.map((r: { type: string }) => r.type)).toEqual(['earn']);
  });

  it('returns an empty page for a customer without a card', async () => {
    const other = (await request(app.getHttpServer()).post('/customers').set(headers()).send({ name: 'Không thẻ' }).expect(201))
      .body.id;
    await ds.query(`DELETE FROM membership_cards WHERE customer_id = $1::uuid`, [other]);
    const res = await request(app.getHttpServer()).get(`/customers/${other}/point-history`).set(headers()).expect(200);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  it('returns 403 without customer.points.history.read (AC-11)', async () => {
    await request(app.getHttpServer())
      .get(`/customers/${customerId}/point-history`)
      .set(headers(readerToken))
      .expect(403);
  });
});
