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
 * PUT /customers/:id/membership-card/points — đặt số dư điểm (2026100101 T-01-02,
 * AC-02..AC-08). Server ghi đúng một dòng ADJUST bằng chênh lệch, dưới khoá thẻ.
 */
describe('Set member points balance (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;
  let staffToken: string;

  const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
  const staffRoleId = 'd0000000-0000-4000-8000-0000000003b1';
  const foreignOrgId = 'a0000000-0000-4000-8000-0000000003f1';

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

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // The shared fixture predates the point keys; grant them to the seeded admin role.
    await grantKeys(SEEDED_ROLE_ID, ['customer.points.adjust', 'customer.points.history.read']);
    await app.get(RbacService).invalidateUserPermissions(seed.userId, seed.organizationId);

    // A staff user holding customer.read/write but not customer.points.adjust (AC-06).
    await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({ email: 'points-staff@test.com', firstName: 'Staff', lastName: 'Points', temporaryPassword: 'password123' })
      .expect(201);
    const [{ id: staffId }] = await ds.query(`SELECT id FROM users WHERE email = 'points-staff@test.com'`);
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'NV điểm', null, NOW(), NOW())`,
      [staffRoleId, seed.organizationId],
    );
    await grantKeys(staffRoleId, ['customer.read', 'customer.write']);
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
      [staffId, staffRoleId, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
      [staffId, seed.branchId, seed.organizationId],
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'points-staff@test.com', password: 'password123', organizationId: seed.organizationId })
      .expect(200);
    staffToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  function headers(token = seed.accessToken) {
    return { Authorization: authHeader(token), 'X-Branch-Id': seed.branchId };
  }

  const createCustomer = async (name: string): Promise<string> =>
    (await request(app.getHttpServer()).post('/customers').set(headers()).send({ name }).expect(201)).body.id;

  /** Creating a customer issues its card; top it up to `points` through the ledger. */
  const issueCard = async (customerId: string, points: number): Promise<string> => {
    const card = await request(app.getHttpServer())
      .get(`/customers/${customerId}/membership-card`)
      .set(headers())
      .expect(200);
    if (points > 0) {
      await request(app.getHttpServer())
        .post(`/customers/membership-cards/${card.body.id}/points`)
        .set(headers())
        .send({ type: 'earn', delta: points, note: 'seed' })
        .expect(201);
    }
    return card.body.id;
  };

  const setBalance = (customerId: string, body: object, token?: string) =>
    request(app.getHttpServer())
      .put(`/customers/${customerId}/membership-card/points`)
      .set(headers(token))
      .send(body);

  const adjustRows = (cardId: string) =>
    ds.query(
      `SELECT delta, note, created_by FROM point_history WHERE card_id = $1::uuid AND type = 'adjust' ORDER BY created_at`,
      [cardId],
    );

  describe('with a card at 120 points', () => {
    let customerId: string;
    let cardId: string;

    beforeAll(async () => {
      customerId = await createCustomer('Điểm 120');
      cardId = await issueCard(customerId, 120);
    });

    it('raises the balance to 200 with one ADJUST +80 row (AC-02)', async () => {
      const res = await setBalance(customerId, { points: 200, note: 'Bù điểm' }).expect(200);
      expect(res.body).toEqual({ cardId, points: 200 });
      const [{ points }] = await ds.query(`SELECT points FROM membership_cards WHERE id = $1::uuid`, [cardId]);
      expect(points).toBe(200);
      expect(await adjustRows(cardId)).toEqual([{ delta: 80, note: 'Bù điểm', created_by: seed.userId }]);
    });

    it('lowers the balance to 50 with an ADJUST -150 row (AC-03)', async () => {
      await setBalance(customerId, { points: 50, note: 'Trừ điểm' }).expect(200);
      const rows = await adjustRows(cardId);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ delta: -150, note: 'Trừ điểm' });
    });

    it('writes nothing when the balance does not change (AC-04)', async () => {
      const res = await setBalance(customerId, { points: 50, note: 'Không đổi' }).expect(200);
      expect(res.body.points).toBe(50);
      expect(await adjustRows(cardId)).toHaveLength(2);
    });

    it.each([
      [{ points: -1, note: 'x' }],
      [{ points: 1.5, note: 'x' }],
      [{ points: 10 }],
      [{ points: 10, note: '' }],
      [{ points: 1_000_000_001, note: 'x' }],
    ])('rejects %j with 400 (AC-05)', async (body) => {
      await setBalance(customerId, body).expect(400);
    });

    it('returns 403 for a user without customer.points.adjust (AC-06)', async () => {
      await setBalance(customerId, { points: 999, note: 'x' }, staffToken).expect(403);
      expect(await adjustRows(cardId)).toHaveLength(2);
    });
  });

  it('returns 404 when the customer has no card (AC-07)', async () => {
    const customerId = await createCustomer('Chưa có thẻ');
    await ds.query(`DELETE FROM membership_cards WHERE customer_id = $1::uuid`, [customerId]);
    const res = await setBalance(customerId, { points: 10, note: 'x' }).expect(404);
    expect(res.body.message).toBe('Khách hàng chưa có thẻ thành viên');
  });

  it('returns 404 for a customer of another organization (AC-08)', async () => {
    const [{ id }] = await ds.query(
      `INSERT INTO customers (id, organization_id, name, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Khách tổ chức khác', 'KH-FOREIGN', $2, NOW(), NOW()) RETURNING id`,
      [foreignOrgId, seed.userId],
    );
    const res = await setBalance(id, { points: 10, note: 'x' }).expect(404);
    expect(res.body.message).toBe('Không tìm thấy khách hàng');
  });
});
