import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource, Logger as TypeOrmLogger } from 'typeorm';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * T-05-03 (AC-17):
 * - `POST /v2/inventory/stock-takes/:id/lines/search` paginates a stock
 *   take's own lines, ordered by line_no, and enforces `inventory.read` +
 *   branch scope.
 * - `GET /inventory/stock-takes/:id?includeLines=false` suppresses the
 *   eager `lines` relation at the query level (ADR-09), while `members`
 *   (also eager on the entity) still comes back — proven by capturing the
 *   SQL TypeORM actually issues, not just the shape of the response body.
 */
describe('Stock take lines search v2 + includeLines (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let itemId: string;
  let storageId: string;
  let locationId: string;
  let stockTakeId: string;

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({ code: 'STKLS-ITEM-A', name: 'STKLS Item A', unit: 'PCS', purchasePrice: 5, sellingPrice: 15 })
      .expect(201);
    itemId = item.body.id;

    const storage = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'STKLS Storage', branchId: seed.branchId })
      .expect(201);
    storageId = storage.body.id;

    const location = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'STKLS-LOC', type: 'SHELF', name: 'STKLS Shelf', storageId, branchId: seed.branchId })
      .expect(201);
    locationId = location.body.id;

    const lines = Array.from({ length: 120 }, () => ({ itemId, locationId }));

    const created = await request(app.getHttpServer())
      .post('/inventory/stock-takes')
      .set(headers())
      .send({
        storageId,
        lines,
        members: [{ fullName: 'STKLS Counter A' }, { fullName: 'STKLS Counter B' }],
      })
      .expect(201);
    stockTakeId = created.body.id;
  }, 300_000);

  afterAll(async () => {
    await app.close();
  });

  it('paginates 120 lines: page 1 returns the first 50, page 3 the last 20, no dup/missing', async () => {
    const page1 = await request(app.getHttpServer())
      .post(`/v2/inventory/stock-takes/${stockTakeId}/lines/search`)
      .set(headers())
      .send({ page: 1, limit: 50 })
      .expect(201);

    expect(page1.body.total).toBe(120);
    expect(page1.body.page).toBe(1);
    expect(page1.body.limit).toBe(50);
    expect(page1.body.data).toHaveLength(50);
    const page1LineNos = page1.body.data.map((l: { lineNo: number }) => l.lineNo);
    expect(page1LineNos).toEqual([...page1LineNos].sort((a, b) => a - b));
    expect(page1LineNos[0]).toBe(1);
    expect(page1LineNos[49]).toBe(50);

    const page2 = await request(app.getHttpServer())
      .post(`/v2/inventory/stock-takes/${stockTakeId}/lines/search`)
      .set(headers())
      .send({ page: 2, limit: 50 })
      .expect(201);
    expect(page2.body.data).toHaveLength(50);

    const page3 = await request(app.getHttpServer())
      .post(`/v2/inventory/stock-takes/${stockTakeId}/lines/search`)
      .set(headers())
      .send({ page: 3, limit: 50 })
      .expect(201);
    expect(page3.body.total).toBe(120);
    expect(page3.body.data).toHaveLength(20);
    const page3LineNos = page3.body.data.map((l: { lineNo: number }) => l.lineNo);
    expect(page3LineNos[0]).toBe(101);
    expect(page3LineNos[19]).toBe(120);

    const allIds = [
      ...page1.body.data.map((l: { id: string }) => l.id),
      ...page2.body.data.map((l: { id: string }) => l.id),
      ...page3.body.data.map((l: { id: string }) => l.id),
    ];
    expect(new Set(allIds).size).toBe(120);

    // Each row carries the joined relations, not just the FKs.
    expect(page1.body.data[0].item.id).toBe(itemId);
    expect(page1.body.data[0].item.code).toBe('STKLS-ITEM-A');
    expect(page1.body.data[0].location.id).toBe(locationId);
  });

  it('rejects a caller without inventory.read (403)', async () => {
    const roleId = randomUUID();
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1, $2, 'no-inventory-read-stkls', 'lacks inventory.read', NOW(), NOW())`,
      [roleId, seed.organizationId],
    );

    const userId = randomUUID();
    const email = `stkls-no-perm-${userId.slice(0, 8)}@e2e.test`;
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'No', 'Perm', true, NOW(), NOW())`,
      [userId, seed.organizationId, email, await bcrypt.hash('password123', 10)],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [userId, roleId, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
      [userId, seed.branchId, seed.organizationId],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123', organizationId: seed.organizationId })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v2/inventory/stock-takes/${stockTakeId}/lines/search`)
      .set({
        Authorization: authHeader(login.body.accessToken),
        'X-Branch-Id': seed.branchId,
      })
      .send({ page: 1, limit: 50 })
      .expect(403);
  });

  describe('GET /inventory/stock-takes/:id — includeLines', () => {
    /**
     * Captures the raw SQL TypeORM issues for the duration of `fn()`, by
     * temporarily replacing the DataSource's logger. `QueryRunner.query`
     * calls `this.driver.connection.logger.logQuery(query, parameters, this)`
     * unconditionally — it does not check the `logging` DataSource option
     * itself, that check lives inside the default logger implementation — so
     * swapping the logger object is a reliable way to observe the exact SQL
     * sent to Postgres, independent of whatever `logging` is configured.
     */
    async function captureQueries(fn: () => Promise<void>): Promise<string[]> {
      const captured: string[] = [];
      const originalLogger = ds.logger;
      const spyLogger: TypeOrmLogger = {
        logQuery: (query: string) => {
          captured.push(query);
        },
        logQueryError: () => undefined,
        logQuerySlow: () => undefined,
        logSchemaBuild: () => undefined,
        logMigration: () => undefined,
        log: () => undefined,
      };
      (ds as unknown as { logger: TypeOrmLogger }).logger = spyLogger;
      try {
        await fn();
      } finally {
        (ds as unknown as { logger: TypeOrmLogger }).logger = originalLogger;
      }
      return captured;
    }

    it('drops lines but keeps members, and issues no join against stock_take_lines when includeLines=false', async () => {
      let body: Record<string, unknown> | undefined;
      const queries = await captureQueries(async () => {
        const res = await request(app.getHttpServer())
          .get(`/inventory/stock-takes/${stockTakeId}`)
          .query({ includeLines: 'false' })
          .set(headers())
          .expect(200);
        body = res.body;
      });

      expect(body?.lines).toBeUndefined();
      expect(Array.isArray(body?.members)).toBe(true);
      expect((body?.members as unknown[]).length).toBe(2);

      const headerQueries = queries.filter((q) => /from\s+"?stock_takes"?/i.test(q));
      expect(headerQueries.length).toBeGreaterThan(0);
      for (const q of headerQueries) {
        expect(q.toLowerCase()).not.toContain('stock_take_lines');
      }
    });

    it('still returns every line, joined, when includeLines is omitted (default true, ADR-01)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/stock-takes/${stockTakeId}`)
        .set(headers())
        .expect(200);

      expect(Array.isArray(res.body.lines)).toBe(true);
      expect(res.body.lines).toHaveLength(120);
      expect(Array.isArray(res.body.members)).toBe(true);
      expect(res.body.members).toHaveLength(2);
    });
  });
});
