import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('POS (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  // ─── Shared setup: item + storage for POS transactions ───────────

  let itemId: string;
  let locationId: string;
  let sessionId: string;

  beforeAll(async () => {
    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({ sku: 'POS-ITEM', name: 'POS Widget', unit: 'PCS', costPrice: 10, sellingPrice: 30 })
      .expect(201);
    itemId = itemRes.body.id;

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'POS WH', branchId: seed.branchId })
      .expect(201);

    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ name: 'POS Loc', storageId: storageRes.body.id, branchId: seed.branchId })
      .expect(201);
    locationId = locRes.body.id;
  });

  // ─── Session lifecycle ────────────────────────────────────────────

  describe('Session management', () => {
    it('should open a POS session', async () => {
      const res = await request(app.getHttpServer())
        .post('/pos/sessions/open')
        .set(headers())
        .send({
          branchId: seed.branchId,
          openingCash: 500.0,
          terminalId: 'T-001',
        })
        .expect(201);

      sessionId = res.body.id;
      expect(res.body.status).toBe('OPEN');
    });

    it('should retrieve the session', async () => {
      const res = await request(app.getHttpServer())
        .get(`/pos/sessions/${sessionId}`)
        .set(headers())
        .expect(200);

      expect(res.body.id).toBe(sessionId);
    });
  });

  // ─── Checkout ─────────────────────────────────────────────────────

  describe('Checkout flow', () => {
    let saleId: string;

    it('should checkout a sale (creates sale + stock movement + journal)', async () => {
      const res = await request(app.getHttpServer())
        .post('/pos/sales/checkout')
        .set(headers())
        .send({
          sessionId,
          branchId: seed.branchId,
          customerId: null,
          lines: [
            { itemId, quantity: 2, unitPrice: 30.0, locationId },
          ],
          payments: [
            { method: 'CASH', amount: 60.0 },
          ],
        })
        .expect(201);

      saleId = res.body.id;
      expect(res.body).toHaveProperty('saleNumber');
      expect(res.body.totalAmount || res.body.total).toBeDefined();
    });

    it('should retrieve the sale', async () => {
      const res = await request(app.getHttpServer())
        .get(`/pos/sales/${saleId}`)
        .set(headers())
        .expect(200);

      expect(res.body.id).toBe(saleId);
    });

    // ─── Return ───────────────────────────────────────────────────

    describe('Return flow', () => {
      let returnId: string;

      it('should process a return (reversal of stock + journal)', async () => {
        const res = await request(app.getHttpServer())
          .post(`/pos/sales/${saleId}/return`)
          .set(headers())
          .send({
            sessionId,
            branchId: seed.branchId,
            reason: 'Defective product',
            lines: [
              { itemId, quantity: 1, locationId },
            ],
            refund: { method: 'CASH', amount: 30.0 },
          })
          .expect(201);

        returnId = res.body.id;
        expect(returnId).toBeDefined();
      });
    });

    // ─── Exchange ─────────────────────────────────────────────────

    describe('Exchange flow', () => {
      it('should process an exchange (paired return + sale)', async () => {
        const newItemRes = await request(app.getHttpServer())
          .post('/inventory/items')
          .set(headers())
          .send({ sku: 'POS-EXCH', name: 'Exchange Widget', unit: 'PCS', costPrice: 12, sellingPrice: 35 })
          .expect(201);

        const res = await request(app.getHttpServer())
          .post(`/pos/sales/${saleId}/exchange`)
          .set(headers())
          .send({
            sessionId,
            branchId: seed.branchId,
            reason: 'Customer changed mind',
            returnLines: [
              { itemId, quantity: 1, locationId },
            ],
            newLines: [
              { itemId: newItemRes.body.id, quantity: 1, unitPrice: 35.0, locationId },
            ],
            priceDifference: 5.0,
            payment: { method: 'CASH', amount: 5.0 },
          })
          .expect(201);

        expect(res.body).toHaveProperty('id');
      });
    });
  });

  // ─── Session reconciliation and close ─────────────────────────────

  describe('Session reconciliation and close', () => {
    it('should initiate session close', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/start-close`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('CLOSING');
    });

    it('should submit reconciliation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/reconciliation`)
        .set(headers())
        .send({
          countedCash: 475.0,
          notes: 'Slight variance',
        })
        .expect(201);

      expect(res.body).toHaveProperty('variance');
    });

    it('should finalize session close', async () => {
      // Approve variance if needed
      await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/reconciliation/approve`)
        .set(headers());

      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/close`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('CLOSED');
    });
  });
});
