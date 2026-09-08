import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * T-03-03 (AC-08): `POST /v2/inventory/transfer-orders/:id/lines/search`
 * paginates a transfer order's own lines, ordered by line_no, and enforces
 * `inventory.transfer.read`.
 */
describe('Transfer order lines search v2 (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let itemId: string;
  let srcStorageId: string;
  let destBranchId: string;
  let transferOrderId: string;

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
      .send({ code: 'TOLS-ITEM-A', name: 'TOLS Item A', unit: 'PCS', purchasePrice: 5, sellingPrice: 15 })
      .expect(201);
    itemId = item.body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'TOLS Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    // A second, real branch: destinationBranchId must differ from the
    // creating actor's branch (create() rejects same-branch transfers).
    destBranchId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'TOLS Dest Branch', 'ACTIVE', false, $3, NOW(), NOW())`,
      [destBranchId, seed.organizationId, seed.userId],
    );

    const lines = Array.from({ length: 120 }, (_, i) => ({
      itemId,
      requestedQty: i + 1,
      sourceStorageId: srcStorageId,
    }));

    const created = await request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: destBranchId,
        sourceStorageId: srcStorageId,
        notes: 'Lines-search E2E',
        lines,
      })
      .expect(201);
    transferOrderId = created.body.id;
  }, 300_000);

  afterAll(async () => {
    await app.close();
  });

  it('paginates 120 lines: page 1 returns the first 50, page 3 the last 20, no dup/missing', async () => {
    const page1 = await request(app.getHttpServer())
      .post(`/v2/inventory/transfer-orders/${transferOrderId}/lines/search`)
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
      .post(`/v2/inventory/transfer-orders/${transferOrderId}/lines/search`)
      .set(headers())
      .send({ page: 2, limit: 50 })
      .expect(201);
    expect(page2.body.data).toHaveLength(50);

    const page3 = await request(app.getHttpServer())
      .post(`/v2/inventory/transfer-orders/${transferOrderId}/lines/search`)
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

    // Each row carries the item relation, not just the FK.
    expect(page1.body.data[0].item.id).toBe(itemId);
    expect(page1.body.data[0].item.code).toBe('TOLS-ITEM-A');
  });

  it('rejects a caller without inventory.transfer.read (403)', async () => {
    const roleId = randomUUID();
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1, $2, 'no-transfer-read', 'lacks inventory.transfer.read', NOW(), NOW())`,
      [roleId, seed.organizationId],
    );

    const userId = randomUUID();
    const email = `tols-no-perm-${userId.slice(0, 8)}@e2e.test`;
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
      .post(`/v2/inventory/transfer-orders/${transferOrderId}/lines/search`)
      .set({
        Authorization: authHeader(login.body.accessToken),
        'X-Branch-Id': seed.branchId,
      })
      .send({ page: 1, limit: 50 })
      .expect(403);
  });
});
