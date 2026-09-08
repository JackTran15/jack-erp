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
 * T-04-04 (AC-15):
 * - `POST /v2/inventory/stock/transfers/:id/lines/search` paginates a stock
 *   transfer's own lines, ordered by line_no, and enforces
 *   `inventory.transfer.read`.
 * - `GET /inventory/stock/transfers/:id?includeLines=false` suppresses the
 *   eager `lines` relation at the query level (ADR-01) — proven by capturing
 *   the SQL TypeORM actually issues, not just the shape of the response body.
 */
describe('Stock transfer lines search v2 + includeLines (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let itemId: string;
  let srcStorageId: string;
  let dstStorageId: string;
  let transferId: string;

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
      .send({ code: 'STLS-ITEM-A', name: 'STLS Item A', unit: 'PCS', purchasePrice: 5, sellingPrice: 15 })
      .expect(201);
    itemId = item.body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'STLS Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    const dst = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'STLS Dest WH', branchId: seed.branchId })
      .expect(201);
    dstStorageId = dst.body.id;

    await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'STLS-SRC-LOC', type: 'SHELF', name: 'STLS Src Shelf', storageId: srcStorageId, branchId: seed.branchId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'STLS-DST-LOC', type: 'SHELF', name: 'STLS Dst Shelf', storageId: dstStorageId, branchId: seed.branchId })
      .expect(201);

    const lines = Array.from({ length: 120 }, (_, i) => ({
      itemId,
      quantity: i + 1,
      sourceStorageId: srcStorageId,
      destinationStorageId: dstStorageId,
    }));

    const created = await request(app.getHttpServer())
      .post('/inventory/stock/transfers')
      .set(headers())
      .send({ allowNegative: true, lines })
      .expect(201);
    transferId = created.body.id;
  }, 300_000);

  afterAll(async () => {
    await app.close();
  });

  it('paginates 120 lines: page 1 returns the first 50, page 3 the last 20, no dup/missing', async () => {
    const page1 = await request(app.getHttpServer())
      .post(`/v2/inventory/stock/transfers/${transferId}/lines/search`)
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
      .post(`/v2/inventory/stock/transfers/${transferId}/lines/search`)
      .set(headers())
      .send({ page: 2, limit: 50 })
      .expect(201);
    expect(page2.body.data).toHaveLength(50);

    const page3 = await request(app.getHttpServer())
      .post(`/v2/inventory/stock/transfers/${transferId}/lines/search`)
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
    expect(page1.body.data[0].item.code).toBe('STLS-ITEM-A');
    expect(page1.body.data[0].sourceStorage.id).toBe(srcStorageId);
    expect(page1.body.data[0].destinationStorage.id).toBe(dstStorageId);
  });

  it('rejects a caller without inventory.transfer.read (403)', async () => {
    const roleId = randomUUID();
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1, $2, 'no-transfer-read-stls', 'lacks inventory.transfer.read', NOW(), NOW())`,
      [roleId, seed.organizationId],
    );

    const userId = randomUUID();
    const email = `stls-no-perm-${userId.slice(0, 8)}@e2e.test`;
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
      .post(`/v2/inventory/stock/transfers/${transferId}/lines/search`)
      .set({
        Authorization: authHeader(login.body.accessToken),
        'X-Branch-Id': seed.branchId,
      })
      .send({ page: 1, limit: 50 })
      .expect(403);
  });

  describe('GET /inventory/stock/transfers/:id — includeLines', () => {
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

    it('omits the lines field and issues no join against stock_transfer_lines when includeLines=false', async () => {
      let body: Record<string, unknown> | undefined;
      const queries = await captureQueries(async () => {
        const res = await request(app.getHttpServer())
          .get(`/inventory/stock/transfers/${transferId}`)
          .query({ includeLines: 'false' })
          .set(headers())
          .expect(200);
        body = res.body;
      });

      expect(body?.lines).toBeUndefined();
      const headerQueries = queries.filter((q) => /from\s+"?stock_transfers"?/i.test(q));
      expect(headerQueries.length).toBeGreaterThan(0);
      for (const q of headerQueries) {
        expect(q.toLowerCase()).not.toContain('stock_transfer_lines');
      }
    });

    it('still returns every line, joined, when includeLines is omitted (default true, ADR-01)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/stock/transfers/${transferId}`)
        .set(headers())
        .expect(200);

      expect(Array.isArray(res.body.lines)).toBe(true);
      expect(res.body.lines).toHaveLength(120);
    });
  });
});
