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
import {
  buyMGetNBody,
  giftItemBody,
  invoiceDiscountBody,
  itemDiscountBody,
  seedPromotionFixtures,
  tieredDiscountBody,
  type PromotionSeedResult,
} from './setup/promotion-seed';

/**
 * Lifecycle of a promotion program over real HTTP + a real database.
 *
 * The money maths is already covered exhaustively by the domain unit tests, so
 * this suite is about the seams instead: does what the client sent survive the
 * mapper and the repository, does tenancy hold, does the idempotency
 * interceptor cover the v2 routes.
 */
describe('Promotion programs — CRUD (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let fixtures: PromotionSeedResult;

  const post = (token: string, url: string, body: unknown, headers: Record<string, string> = {}) => {
    const req = request(app.getHttpServer()).post(url).set('Authorization', authHeader(token));
    for (const [key, value] of Object.entries(headers)) req.set(key, value);
    return req.send(body as object);
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    fixtures = await seedPromotionFixtures(app, base);
    // Booting AppModule wires every Kafka consumer; measured at ~130s on a local
    // docker stack, which is why the 120s the cash-voucher suites allow is not
    // enough. Schema sync itself is ~2s — the wait is all broker handshakes.
  }, 300_000);

  // Closing the app disconnects every Kafka consumer one by one; the default
  // 30s hook timeout expires mid-teardown and Jest reports it as a suite failure
  // even when all tests passed.
  afterAll(async () => {
    await app?.close();
  }, 120_000);

  const item685 = () => fixtures.items.find((i) => i.code === 'SKU-685')!.id;

  describe('creating every promotion type', () => {
    const cases = [
      ['INVOICE_DISCOUNT', () => invoiceDiscountBody()],
      ['ITEM_DISCOUNT', () => itemDiscountBody(item685())],
      ['TIERED_DISCOUNT', () => tieredDiscountBody(item685())],
      ['GIFT_ITEM', () => giftItemBody(item685())],
      ['BUY_M_GET_N', () => buyMGetNBody([item685()])],
    ] as const;

    it.each(cases)(
      'AC-15: creates a %s and GET returns the configuration it was sent',
      async (type, makeBody) => {
        const body = makeBody();
        const created = await post(base.accessToken, '/v2/promotions', body).expect(201);

        expect(created.body.code).toMatch(/^KM\d+$/);
        expect(created.body.status).toBe('TRACKING');
        expect(created.body.type).toBe(type);

        const fetched = await request(app.getHttpServer())
          .get(`/v2/promotions/${created.body.id}`)
          .set('Authorization', authHeader(base.accessToken))
          .expect(200);

        // Compare the configuration that was sent, field by field, rather than
        // the whole payload — the response also carries server-owned values
        // (id, code, timestamps) the client never sent.
        expect(fetched.body.name).toBe(body.name);
        expect(fetched.body.type).toBe(type);
        expect(fetched.body.applyTo).toBe(body.applyTo);
        expect(fetched.body.priority).toBe(body.priority);

        const sentLines = (body.groups ?? []).flatMap((g: any) => g.lines ?? []);
        const gotLines = (fetched.body.groups ?? []).flatMap((g: any) => g.lines ?? []);
        expect(gotLines).toHaveLength(sentLines.length);
        for (const sent of sentLines) {
          expect(
            gotLines.some(
              (got: any) => got.targetId === sent.targetId && got.role === sent.role,
            ),
          ).toBe(true);
        }

        const sentTiers = (body.groups ?? []).flatMap((g: any) => g.tiers ?? []);
        const gotTiers = (fetched.body.groups ?? []).flatMap((g: any) => g.tiers ?? []);
        expect(gotTiers).toHaveLength(sentTiers.length);
      },
    );
  });

  describe('mutations', () => {
    it('AC-16: refuses to change `type` on an existing program', async () => {
      const created = await post(base.accessToken, '/v2/promotions', invoiceDiscountBody()).expect(201);

      const res = await request(app.getHttpServer())
        .put(`/v2/promotions/${created.body.id}`)
        .set('Authorization', authHeader(base.accessToken))
        .send(itemDiscountBody(item685(), { name: created.body.name }))
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('PROMOTION_TYPE_IMMUTABLE');
    });

    it('AC-17: duplicate keeps every child row but takes a fresh code', async () => {
      const original = await post(
        base.accessToken,
        '/v2/promotions',
        tieredDiscountBody(item685()),
      ).expect(201);

      const copy = await post(
        base.accessToken,
        `/v2/promotions/${original.body.id}/duplicate`,
        {},
      ).expect(201);

      expect(copy.body.id).not.toBe(original.body.id);
      expect(copy.body.code).not.toBe(original.body.code);
      expect(copy.body.status).toBe('TRACKING');

      const countChildren = (detail: any) => ({
        groups: detail.groups.length,
        lines: detail.groups.flatMap((g: any) => g.lines ?? []).length,
        tiers: detail.groups.flatMap((g: any) => g.tiers ?? []).length,
      });
      expect(countChildren(copy.body)).toEqual(countChildren(original.body));
    });

    it('AC-18: delete is soft — gone from the API, still on the row with deleted_at', async () => {
      const created = await post(base.accessToken, '/v2/promotions', invoiceDiscountBody()).expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .delete(`/v2/promotions/${id}`)
        .set('Authorization', authHeader(base.accessToken))
        .expect(204);

      await request(app.getHttpServer())
        .get(`/v2/promotions/${id}`)
        .set('Authorization', authHeader(base.accessToken))
        .expect(404);

      const search = await post(base.accessToken, '/v2/promotions/search', { limit: 200 }).expect(201);
      expect(search.body.data.some((row: any) => row.id === id)).toBe(false);

      const rows = await app
        .get(DataSource)
        .query(`SELECT deleted_at FROM promotion_programs WHERE id = $1::uuid`, [id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('changes status through the dedicated endpoint', async () => {
      const created = await post(base.accessToken, '/v2/promotions', invoiceDiscountBody()).expect(201);

      const patched = await request(app.getHttpServer())
        .patch(`/v2/promotions/${created.body.id}/status`)
        .set('Authorization', authHeader(base.accessToken))
        .send({ status: 'STOPPED' })
        .expect(200);

      expect(patched.body.status).toBe('STOPPED');
    });
  });

  describe('AC-19: tenancy', () => {
    let otherToken: string;
    let foreignId: string;

    beforeAll(async () => {
      const created = await post(base.accessToken, '/v2/promotions', invoiceDiscountBody()).expect(201);
      foreignId = created.body.id;

      // A second organization with its own admin, to prove the guard is scoped
      // by organization rather than by "is this user an admin".
      const ds = app.get(DataSource);
      const orgB = 'a0000000-0000-4000-8000-0000000000b2';
      const userB = 'c0000000-0000-4000-8000-0000000000b2';
      const roleB = 'd0000000-0000-4000-8000-0000000000b2';
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);

      await ds.query(
        `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
         VALUES ($1::uuid, $1::uuid, 'Org B', 'b@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [orgB, userB],
      );
      await ds.query(
        `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'b@test.com', $3, 'B', 'Admin', true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [userB, orgB, hash],
      );
      await ds.query(
        `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'admin', 'Full access', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [roleB, orgB],
      );
      await ds.query(
        `INSERT INTO user_roles (id, user_id, role_id, organization_id)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
        [userB, roleB, orgB],
      );
      for (const key of ['promotion.read', 'promotion.write', 'promotion.delete']) {
        await ds.query(
          `INSERT INTO role_permissions (id, role_id, permission_id)
           SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
           ON CONFLICT DO NOTHING`,
          [roleB, key],
        );
      }

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'b@test.com', password: 'password123', organizationId: orgB })
        .expect(200);
      otherToken = login.body.accessToken;
    });

    // 404 rather than 403 on purpose: a 403 would confirm the id exists.
    it('answers 404 — not 403 — for another org’s program', async () => {
      await request(app.getHttpServer())
        .get(`/v2/promotions/${foreignId}`)
        .set('Authorization', authHeader(otherToken))
        .expect(404);

      await request(app.getHttpServer())
        .put(`/v2/promotions/${foreignId}`)
        .set('Authorization', authHeader(otherToken))
        .send(invoiceDiscountBody())
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/v2/promotions/${foreignId}`)
        .set('Authorization', authHeader(otherToken))
        .expect(404);
    });

    it('does not leak another org’s programs into search', async () => {
      const res = await post(otherToken, '/v2/promotions/search', { limit: 200 }).expect(201);
      expect(res.body.data.some((row: any) => row.id === foreignId)).toBe(false);
    });
  });

  describe('AC-20: idempotency', () => {
    it('replays the stored response for the same key + body, and 409s on a different body', async () => {
      const key = `e2e-promo-${Date.now()}`;
      const body = invoiceDiscountBody({ name: 'Idempotent promo' });

      const first = await post(base.accessToken, '/v2/promotions', body, {
        'X-Idempotency-Key': key,
      }).expect(201);

      const replay = await post(base.accessToken, '/v2/promotions', body, {
        'X-Idempotency-Key': key,
      });
      expect(replay.headers['x-idempotency-status']).toBe('REPLAYED');
      expect(replay.body.id).toBe(first.body.id);

      const rows = await app
        .get(DataSource)
        .query(`SELECT id FROM promotion_programs WHERE name = 'Idempotent promo' AND deleted_at IS NULL`);
      expect(rows).toHaveLength(1);

      await post(base.accessToken, '/v2/promotions', invoiceDiscountBody({ name: 'Different body' }), {
        'X-Idempotency-Key': key,
      }).expect(409);
    });
  });

  describe('AC-23: search', () => {
    it('orders by priority ascending — the real application order (BR-001)', async () => {
      await post(base.accessToken, '/v2/promotions', invoiceDiscountBody({ name: 'prio-50', priority: 50 })).expect(201);
      await post(base.accessToken, '/v2/promotions', invoiceDiscountBody({ name: 'prio-10', priority: 10 })).expect(201);
      await post(base.accessToken, '/v2/promotions', invoiceDiscountBody({ name: 'prio-90', priority: 90 })).expect(201);

      const res = await post(base.accessToken, '/v2/promotions/search', { limit: 200 }).expect(201);
      const priorities = res.body.data.map((row: any) => row.priority);
      expect(priorities).toEqual([...priorities].sort((a: number, b: number) => a - b));
    });

    it('filters by name with each of the five string operators', async () => {
      await post(base.accessToken, '/v2/promotions', invoiceDiscountBody({ name: 'Alpha Bravo' })).expect(201);

      const search = (operator: string, value: string) =>
        post(base.accessToken, '/v2/promotions/search', {
          limit: 200,
          name: { operator, value },
        }).expect(201);

      const names = (res: any) => res.body.data.map((r: any) => r.name);

      expect(names(await search('*', 'lpha Bra'))).toContain('Alpha Bravo');
      expect(names(await search('=', 'Alpha Bravo'))).toContain('Alpha Bravo');
      expect(names(await search('+', 'Alpha'))).toContain('Alpha Bravo');
      expect(names(await search('-', 'Bravo'))).toContain('Alpha Bravo');
      expect(names(await search('!', 'Alpha'))).not.toContain('Alpha Bravo');
    });

    it('paginates with the documented envelope', async () => {
      const res = await post(base.accessToken, '/v2/promotions/search', { page: 1, limit: 2 }).expect(201);

      expect(res.body).toMatchObject({ page: 1, limit: 2 });
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(typeof res.body.total).toBe('number');
    });

    // T-03-05 — an open-ended program belongs to every period; a plain
    // `col >= :from` would drop it because `NULL >= x` is NULL.
    it('keeps programs with no start date inside a period filter', async () => {
      const created = await post(
        base.accessToken,
        '/v2/promotions',
        invoiceDiscountBody({ name: 'Open ended' }),
      ).expect(201);

      const res = await post(base.accessToken, '/v2/promotions/search', {
        limit: 200,
        startDate: { from: '2020-01-01', to: '2035-12-31' },
      }).expect(201);

      expect(res.body.data.some((row: any) => row.id === created.body.id)).toBe(true);
    });
  });

  describe('AC-21: branch scope', () => {
    it('shows a chain-wide program everywhere but hides one pinned to another branch', async () => {
      const chainWide = await post(
        base.accessToken,
        '/v2/promotions',
        invoiceDiscountBody({ name: 'Chain wide' }),
      ).expect(201);

      const otherBranchId = 'b0000000-0000-4000-8000-0000000000f9';
      await app.get(DataSource).query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [otherBranchId, base.organizationId, base.userId],
      );

      const pinned = await post(
        base.accessToken,
        '/v2/promotions',
        invoiceDiscountBody({ name: 'Other branch only', branchIds: [otherBranchId] }),
      ).expect(201);

      const res = await request(app.getHttpServer())
        .post('/v2/promotions/search')
        .set('Authorization', authHeader(base.accessToken))
        .set('X-Branch-Id', base.branchId)
        .send({ limit: 200 })
        .expect(201);

      const ids = res.body.data.map((row: any) => row.id);
      expect(ids).toContain(chainWide.body.id);
      expect(ids).not.toContain(pinned.body.id);

      // Third case: the pinned program is visible from the branch it belongs to.
      // Without this the two assertions above are also satisfied by a query that
      // simply drops every branch-scoped program.
      //
      // Switching branch is a token operation, not a header one. The login JWT
      // always carries `branchId = branchIds[0]`, and `actor-context.decorator.ts`
      // resolves `jwt > header`, so `X-Branch-Id` alone never changes the active
      // branch — `POST /auth/switch-branch` mints a token that does. Assigning the
      // branch first is required: `switchBranch` only accepts assigned branches.
      await app.get(DataSource).query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
         ON CONFLICT DO NOTHING`,
        [base.userId, otherBranchId, base.organizationId],
      );
      const relogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
          organizationId: base.organizationId,
        })
        .expect(200);

      const switched = await request(app.getHttpServer())
        .post('/auth/switch-branch')
        .set('Authorization', authHeader(relogin.body.accessToken))
        .send({ branchId: otherBranchId })
        .expect(200);

      const fromOwnBranch = await request(app.getHttpServer())
        .post('/v2/promotions/search')
        .set('Authorization', authHeader(switched.body.accessToken))
        .set('X-Branch-Id', otherBranchId)
        .send({ limit: 200 })
        .expect(201);

      const idsThere = fromOwnBranch.body.data.map((row: any) => row.id);
      expect(idsThere).toContain(pinned.body.id);
      expect(idsThere).toContain(chainWide.body.id);
    });
  });
});
