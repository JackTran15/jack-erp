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
 * T-03-01 (AC-07): every `transfer_order_lines` insert stamps a 1-based
 * `line_no` by array index, both for a freshly created transfer order and
 * for edits (which delete + re-insert the whole line set).
 */
describe('Transfer order line_no (E2E)', () => {
  const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let itemAId: string;
  let itemBId: string;
  let itemCId: string;
  let srcStorageId: string;
  let destBranchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const item = (code: string) =>
      request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({ code, name: code, unit: 'PCS', purchasePrice: 5, sellingPrice: 15 })
        .expect(201);

    itemAId = (await item('TOLN-ITEM-A')).body.id;
    itemBId = (await item('TOLN-ITEM-B')).body.id;
    itemCId = (await item('TOLN-ITEM-C')).body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'TOLN Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    // A second, real branch: destinationBranchId must differ from the
    // creating actor's branch (create() rejects same-branch transfers).
    destBranchId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'TOLN Dest Branch', 'ACTIVE', false, $3, NOW(), NOW())`,
      [destBranchId, seed.organizationId, seed.userId],
    );
    const destUserId = randomUUID();
    const email = `toln-dest-${destUserId.slice(0, 8)}@e2e.test`;
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'TOLN', 'Dest', true, NOW(), NOW())`,
      [destUserId, seed.organizationId, email, await bcrypt.hash('password123', 10)],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [destUserId, SEEDED_ROLE_ID, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
      [destUserId, destBranchId, seed.organizationId],
    );
  }, 300_000);

  afterAll(async () => {
    await app.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  function line(itemId: string, requestedQty: number) {
    return { itemId, requestedQty, sourceStorageId: srcStorageId };
  }

  function createVoucher(lines: ReturnType<typeof line>[]) {
    return request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: destBranchId,
        sourceStorageId: srcStorageId,
        notes: 'Line-no E2E',
        lines,
      });
  }

  it('stamps line_no = 1,2,3 on a freshly created 3-line transfer order', async () => {
    const res = await createVoucher([
      line(itemAId, 1),
      line(itemBId, 2),
      line(itemCId, 3),
    ]).expect(201);

    const transferOrderId = res.body.id;
    const lineNos = (res.body.lines as { itemId: string; lineNo: number }[])
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((l) => l.lineNo);
    expect(lineNos).toEqual([1, 2, 3]);

    const rows = await ds.query(
      `SELECT line_no FROM transfer_order_lines WHERE transfer_order_id = $1 ORDER BY line_no`,
      [transferOrderId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 2, 3]);
  });

  it('re-stamps line_no from 1 on edit, even when the line count/order changes', async () => {
    const created = await createVoucher([
      line(itemAId, 1),
      line(itemBId, 2),
      line(itemCId, 3),
    ]).expect(201);
    const transferOrderId = created.body.id;

    // Edit down to 2 lines, in reversed item order.
    await request(app.getHttpServer())
      .patch(`/inventory/transfer-orders/${transferOrderId}`)
      .set(headers())
      .send({ lines: [line(itemCId, 1), line(itemAId, 1)] })
      .expect(200);

    const rows = await ds.query(
      `SELECT item_id, line_no FROM transfer_order_lines WHERE transfer_order_id = $1 ORDER BY line_no`,
      [transferOrderId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 2]);
    expect(rows[0].item_id).toBe(itemCId);
    expect(rows[1].item_id).toBe(itemAId);
  });
});
