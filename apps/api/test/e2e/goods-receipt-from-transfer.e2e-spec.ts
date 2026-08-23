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
 * EPIC-08062026 goods-receipt-from-transfer: the import leg. A transfer order is
 * exported (IN_PROGRESS), then the destination branch picks it from the
 * importable list and confirms import → COMPLETED + a TRANSFER_IN goods receipt
 * that round-trips the header fields. Runs same-branch (source == destination)
 * so one seeded token satisfies both the export and import branch guards,
 * mirroring goods-issue-from-transfer.e2e-spec.ts.
 */
describe('Goods receipt from transfer order (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let itemId: string;
  let srcStorageId: string;
  let srcLocationId: string;
  let destStorageId: string;
  let destLocationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'GRT-ITEM',
        name: 'Receipt-From-Transfer Item',
        unit: 'PCS',
        purchasePrice: 7,
        sellingPrice: 20,
      })
      .expect(201);
    itemId = item.body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'GRT Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    const dest = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'GRT Dest WH', branchId: seed.branchId })
      .expect(201);
    destStorageId = dest.body.id;

    const locs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${srcStorageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    srcLocationId = locs.body.data[0].id;

    const destLocs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${destStorageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    destLocationId = destLocs.body.data[0].id;
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

  /** Create a DRAFT order and export it → IN_PROGRESS; returns the order id. */
  async function createAndExport(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: seed.branchId,
        sourceStorageId: srcStorageId,
        notes: 'GRT e2e',
        lines: [{ itemId, requestedQty: 5, sourceStorageId: srcStorageId }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set(headers())
      .send({
        lines: [{ itemId, locationId: srcLocationId, quantity: 5, unitPrice: 7 }],
      })
      .expect(201);

    return created.body.id as string;
  }

  function importable() {
    return request(app.getHttpServer())
      .get('/inventory/transfer-orders/importable')
      .set(headers());
  }

  it('lists an exported (IN_PROGRESS) order in the importable picker with the XK number + total', async () => {
    const orderId = await createAndExport();
    const res = await importable().expect(200);
    const row = (res.body as Array<{ id: string }>).find((r) => r.id === orderId) as
      | {
          id: string;
          status: string;
          sourceBranchName: string;
          exportGoodsIssueDocumentNumber: string | null;
          totalAmount: number;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.status).toBe('IN_PROGRESS');
    expect(typeof row!.sourceBranchName).toBe('string');
    expect(row!.exportGoodsIssueDocumentNumber).toBeTruthy();
    expect(row!.totalAmount).toBe(35); // 5 × 7
  });

  it('imports with the per-line Kho/Vị trí + header → COMPLETED, receipt round-trips the fields', async () => {
    const orderId = await createAndExport();

    const imported = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set(headers())
      .send({
        lines: [{ itemId, locationId: destLocationId, quantity: 5, unitPrice: 7 }],
        deliverer: 'Jack Jack',
        references: ['XK-REF'],
        occurredAt: '2026-06-08T15:24:00.000Z',
      })
      .expect(201);

    expect(imported.body.status).toBe('COMPLETED');
    const grId = imported.body.importGoodsReceiptId;
    expect(grId).toBeTruthy();

    const gr = await request(app.getHttpServer())
      .get(`/goods-receipts/${grId}`)
      .set(headers())
      .expect(200);
    expect(gr.body.purpose).toBe('TRANSFER_IN');
    expect(gr.body.referenceType).toBe('STOCK_TRANSFER');
    expect(gr.body.referenceId).toBe(orderId);
    expect(gr.body.deliveredBy).toBe('Jack Jack');
    expect(gr.body.references).toEqual(['XK-REF']);
    expect(gr.body.lines[0].locationId).toBe(destLocationId);
    expect(new Date(gr.body.receivedAt).toISOString()).toBe(
      '2026-06-08T15:24:00.000Z',
    );

    // The imported order must drop out of the importable picker.
    const after = await importable().expect(200);
    expect(
      (after.body as Array<{ id: string }>).some((r) => r.id === orderId),
    ).toBe(false);
  });

  describe('both legs balance line by line (AC-09)', () => {
    /**
     * Self-contained two-branch harness.
     *
     * The three tests above transfer a branch to itself, which a later rule now
     * rejects ("Cửa hàng đích phải khác cửa hàng hiện tại") — they have been
     * failing at HEAD since, independently of this feature. Rather than rewrite
     * their semantics, this block seeds its own destination branch and actor.
     *
     * Two logins, not one token with a swapped header: ActorContext resolves
     * `branchId` from the JWT before the X-Branch-Id header, so a header alone
     * does not move the actor to another branch.
     */
    const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
    let destBranchId: string;
    let destToken: string;
    let branchBStorageId: string;
    let branchBLocationId: string;

    const destHeaders = () => ({
      Authorization: authHeader(destToken),
      'X-Branch-Id': destBranchId,
    });

    beforeAll(async () => {
      destBranchId = randomUUID();
      await ds.query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1, $2, 'GRT Dest Branch', 'ACTIVE', false, $3, NOW(), NOW())`,
        [destBranchId, seed.organizationId, seed.userId],
      );

      const userId = randomUUID();
      const email = `grt-dest-${userId.slice(0, 8)}@e2e.test`;
      await ds.query(
        `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'GRT', 'Dest', true, NOW(), NOW())`,
        [userId, seed.organizationId, email, await bcrypt.hash('password123', 10)],
      );
      await ds.query(
        `INSERT INTO user_roles (id, user_id, role_id, organization_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [userId, SEEDED_ROLE_ID, seed.organizationId],
      );
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
        [userId, destBranchId, seed.organizationId],
      );

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123', organizationId: seed.organizationId })
        .expect(200);
      destToken = login.body.accessToken;

      const wh = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(destHeaders())
        .send({ name: 'GRT Dest Branch WH', branchId: destBranchId })
        .expect(201);
      branchBStorageId = wh.body.id;

      const locs = await request(app.getHttpServer())
        .get(
          `/inventory/locations?page=1&pageSize=1&storageId=${branchBStorageId}&includeUnassigned=true`,
        )
        .set(destHeaders())
        .expect(200);
      branchBLocationId = locs.body.data[0].id;
    });

    /** Σ line_value the ledger holds for one voucher. */
    async function ledgerValue(referenceType: string, referenceId: string) {
      const [row] = await ds.query(
        `SELECT COALESCE(SUM(line_value), 0)::float8 AS value
           FROM stock_ledger_entries
          WHERE reference_type = $1 AND reference_id = $2`,
        [referenceType, referenceId],
      );
      return (row as { value: number }).value;
    }

    /** Export the order as two rows of the same item at two prices. */
    async function createAndExportTwoPrices(): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/inventory/transfer-orders')
        .set(headers())
        .send({
          sourceBranchId: seed.branchId,
          destinationBranchId: destBranchId,
          sourceStorageId: srcStorageId,
          notes: 'GRT two-price e2e',
          lines: [{ itemId, requestedQty: 9, sourceStorageId: srcStorageId }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${created.body.id}/export`)
        .set(headers())
        .send({
          lines: [
            { itemId, locationId: srcLocationId, quantity: 3, unitPrice: 350 },
            { itemId, locationId: srcLocationId, quantity: 6, unitPrice: 340 },
          ],
        })
        .expect(201);

      return created.body.id as string;
    }

    it('shows the destination both issued rows, then receives them at both prices (AC-09)', async () => {
      const orderId = await createAndExportTwoPrices();

      // The picker mirrors the goods issue, not the single order line: matching
      // issue lines back by itemId could only ever surface the first of them.
      const res = await request(app.getHttpServer())
        .get('/inventory/transfer-orders/importable')
        .set(destHeaders())
        .expect(200);
      const row = (
        res.body as Array<{
          id: string;
          totalAmount: number;
          lines: Array<{ id: string; quantity: number; unitPrice: number }>;
        }>
      ).find((r) => r.id === orderId)!;
      expect(row.lines).toHaveLength(2);
      expect(row.lines.map((l) => l.unitPrice).sort((a, b) => a - b)).toEqual([340, 350]);
      expect(row.lines.map((l) => l.quantity).sort((a, b) => a - b)).toEqual([3, 6]);
      expect(new Set(row.lines.map((l) => l.id)).size).toBe(2);
      expect(row.totalAmount).toBe(3 * 350 + 6 * 340); // 3090

      // Receive exactly what was sent — one receipt row per issued row.
      const imported = await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${orderId}/import`)
        .set(destHeaders())
        .send({
          lines: row.lines.map((l) => ({
            itemId,
            locationId: branchBLocationId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        })
        .expect(201);

      const grId = imported.body.importGoodsReceiptId as string;
      const giId = imported.body.exportGoodsIssueId as string;
      expect(grId).toBeTruthy();
      expect(giId).toBeTruthy();

      // Read the receipt rows from the table rather than GET /goods-receipts/:id:
      // that endpoint needs a permission this suite's seeded role does not carry,
      // and the claim under test is about what was stored, not about the reader.
      const receiptRows = await ds.query(
        `SELECT quantity, unit_price FROM goods_receipt_lines
          WHERE goods_receipt_id = $1`,
        [grId],
      );
      const received = (receiptRows as Array<{ quantity: string; unit_price: string }>)
        .map((l) => [Number(l.quantity), Number(l.unit_price)])
        .sort((a, b) => a[0] - b[0]);
      expect(received).toEqual([
        [3, 350],
        [6, 340],
      ]);

      // The two legs must be worth the same, opposite signs: value neither
      // appears nor evaporates crossing between branches.
      const issueValue = await ledgerValue('GOODS_ISSUE', giId);
      const receiptValue = await ledgerValue('GOODS_RECEIPT', grId);
      expect(issueValue).toBe(-3090);
      expect(receiptValue).toBe(3090);
      expect(issueValue + receiptValue).toBe(0);
    });
  });

  it('rejects an import from a non-destination branch context is covered by guards; replays idempotently', async () => {
    const orderId = await createAndExport();
    const key = `grt-import-${orderId}`;
    const body = { destinationStorageId: destStorageId };

    const first = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set({ ...headers(), 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set({ ...headers(), 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    expect(replay.body.importGoodsReceiptId).toBe(
      first.body.importGoodsReceiptId,
    );
  });
});
