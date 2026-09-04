import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * QA #8, and the reason this suite exists at all.
 *
 * The source branch edits a posted transfer-out goods issue — adding an item
 * the order never carried, changing a quantity, dropping a line — and the
 * destination branch can no longer receive: `400 Line item is not part of the
 * transfer order`. The receipt form mirrors the *issue's* lines while
 * `confirmImport` validates against the *order's* lines, and
 * `adjustRequestedQty` was supposed to keep the two in step.
 *
 * That was diagnosed and "fixed" on 2026-08-24 (commit 609b2922). The fix never
 * ran: it gated its insert on `updated.length > 0` against a TypeORM UPDATE
 * result, which is `[rows, rowCount]` and therefore always length 2. It shipped
 * with a unit test written specifically to prove the insert happened — green for
 * ten days, because the test mocked `manager.query` as returning `[]`, a shape
 * the driver never produces.
 *
 * So this suite makes exactly one promise the unit test could not: every
 * assertion below reads the database. No mock of the query layer appears
 * anywhere in this file, and adding one would void the whole point.
 */
describe('Transfer order — export edited, then imported (E2E)', () => {
  const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  // Three items: A survives with a changed quantity, B is dropped, C is added
  // by the edit — the three operations QA performed in one save.
  let itemA: string;
  let itemB: string;
  let itemC: string;
  let srcStorageId: string;
  let srcLocationId: string;

  let destBranchId: string;
  let destToken: string;
  let destLocationId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });
  const destHeaders = () => ({
    Authorization: authHeader(destToken),
    'X-Branch-Id': destBranchId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const makeItem = async (code: string) => {
      const res = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          code,
          name: `Export-edit ${code}`,
          unit: 'PCS',
          purchasePrice: 10,
          sellingPrice: 30,
        })
        .expect(201);
      return res.body.id as string;
    };
    itemA = await makeItem('TXE-A');
    itemB = await makeItem('TXE-B');
    itemC = await makeItem('TXE-C');

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'TXE Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;
    const srcLocs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${srcStorageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    srcLocationId = srcLocs.body.data[0].id;

    // A real destination branch with its own actor: ActorContext takes branchId
    // from the JWT before the X-Branch-Id header, so the receiving side needs
    // its own login, not a swapped header.
    destBranchId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'TXE Dest Branch', 'ACTIVE', false, $3, NOW(), NOW())`,
      [destBranchId, seed.organizationId, seed.userId],
    );
    const destUserId = randomUUID();
    const email = `txe-dest-${destUserId.slice(0, 8)}@e2e.test`;
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'TXE', 'Dest', true, NOW(), NOW())`,
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
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123', organizationId: seed.organizationId })
      .expect(200);
    destToken = login.body.accessToken;

    const destWh = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(destHeaders())
      .send({ name: 'TXE Dest WH', branchId: destBranchId })
      .expect(201);
    const destLocs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${destWh.body.id}&includeUnassigned=true`,
      )
      .set(destHeaders())
      .expect(200);
    destLocationId = destLocs.body.data[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** The order as first raised: A×3 and B×5, exported to the destination branch. */
  async function createAndExport(): Promise<{ orderId: string; issueId: string }> {
    const created = await request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: destBranchId,
        sourceStorageId: srcStorageId,
        notes: 'export-edit e2e',
        lines: [
          { itemId: itemA, requestedQty: 3, sourceStorageId: srcStorageId },
          { itemId: itemB, requestedQty: 5, sourceStorageId: srcStorageId },
        ],
      })
      .expect(201);

    const exported = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set(headers())
      .send({
        lines: [
          { itemId: itemA, locationId: srcLocationId, quantity: 3, unitPrice: 10 },
          { itemId: itemB, locationId: srcLocationId, quantity: 5, unitPrice: 10 },
        ],
      })
      .expect(201);

    return {
      orderId: created.body.id as string,
      issueId: exported.body.exportGoodsIssueId as string,
    };
  }

  /** Straight from the table — the only evidence this suite accepts. */
  async function orderLines(
    orderId: string,
  ): Promise<Array<{ item_id: string; requested_qty: string; source_location_id: string | null }>> {
    return ds.query(
      `SELECT item_id, requested_qty, source_location_id
         FROM transfer_order_lines
        WHERE transfer_order_id = $1
        ORDER BY item_id`,
      [orderId],
    );
  }

  it('carries all three edits of one save onto the order: A changed, B zeroed, C inserted (AC-05)', async () => {
    const { orderId, issueId } = await createAndExport();

    // One save doing everything QA did: drop B, change A 3 → 4, add C ×2.
    await request(app.getHttpServer())
      .patch(`/inventory/goods-issues/${issueId}`)
      .set(headers())
      .send({
        lines: [
          { itemId: itemA, locationId: srcLocationId, quantity: 4, unitPrice: 10 },
          { itemId: itemC, locationId: srcLocationId, quantity: 2, unitPrice: 10 },
        ],
      })
      .expect(200);

    const lines = await orderLines(orderId);
    const byItem = new Map(lines.map((l) => [l.item_id, l]));

    expect(Number(byItem.get(itemA)!.requested_qty)).toBe(4);
    // Removed from the issue: floored at 0, never negative.
    expect(Number(byItem.get(itemB)!.requested_qty)).toBe(0);

    // The row that never existed before this fix. Under the 2026-08-24 code the
    // map has no entry here at all, and the destination cannot receive item C.
    const inserted = byItem.get(itemC);
    expect(inserted).toBeDefined();
    expect(Number(inserted!.requested_qty)).toBe(2);

    // One row per item — the UPDATE branch must not double-insert for A.
    expect(lines).toHaveLength(3);
  });

  it('lets the destination receive what the edited issue actually carries — no 400 (AC-02)', async () => {
    const { orderId, issueId } = await createAndExport();

    await request(app.getHttpServer())
      .patch(`/inventory/goods-issues/${issueId}`)
      .set(headers())
      .send({
        lines: [
          { itemId: itemA, locationId: srcLocationId, quantity: 4, unitPrice: 10 },
          { itemId: itemC, locationId: srcLocationId, quantity: 2, unitPrice: 10 },
        ],
      })
      .expect(200);

    // The picker mirrors the goods issue — this is what the receipt form
    // prefills from, so it is what the destination will submit.
    const picker = await request(app.getHttpServer())
      .get('/inventory/transfer-orders/importable')
      .set(destHeaders())
      .expect(200);
    const row = (picker.body as Array<{ id: string; lines: Array<{ itemId: string; quantity: number }> }>)
      .find((r) => r.id === orderId);
    expect(row).toBeDefined();
    expect(row!.lines.map((l) => l.itemId).sort()).toEqual([itemA, itemC].sort());

    // The step that returned 400 for QA. Submitting exactly what the picker
    // showed, from the destination branch.
    const imported = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set(destHeaders())
      .send({
        lines: row!.lines.map((l) => ({
          itemId: l.itemId,
          locationId: destLocationId,
          quantity: l.quantity,
          unitPrice: 10,
        })),
      })
      .expect(201);

    expect(imported.body.status).toBe('COMPLETED');
    const receiptId = imported.body.importGoodsReceiptId;
    expect(receiptId).toBeTruthy();

    const receiptLines: Array<{ item_id: string; quantity: string }> = await ds.query(
      `SELECT item_id, quantity FROM goods_receipt_lines
        WHERE goods_receipt_id = $1 ORDER BY item_id`,
      [receiptId],
    );
    expect(receiptLines).toHaveLength(2);
    const receivedByItem = new Map(
      receiptLines.map((l) => [l.item_id, Number(l.quantity)]),
    );
    expect(receivedByItem.get(itemA)).toBe(4);
    expect(receivedByItem.get(itemC)).toBe(2);
    // B was dropped from the issue, so it must not arrive at the destination.
    expect(receivedByItem.has(itemB)).toBe(false);
  });
});
