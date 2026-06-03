import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * Covers the loyalty additions that don't require the full checkout machinery
 * (stock + COA seed), which the POS e2e deliberately skips:
 *   - GET /customers/:id/summary aggregation
 *   - POST/DELETE /invoices/:id/redeem-points on a DRAFT invoice
 * The synchronous point deduction at checkout is covered by the unit specs
 * (checkout-invoice.service.spec, membership-card.service.spec).
 */
describe('Loyalty (E2E)', () => {
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

  const createCustomer = async (name: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set(headers())
      .send({ name })
      .expect(201);
    return res.body.id;
  };

  const issueCardWithPoints = async (
    customerId: string,
    points: number,
  ): Promise<string> => {
    const cardRes = await request(app.getHttpServer())
      .post(`/customers/${customerId}/membership-card`)
      .set(headers())
      .send({ issuedAt: '2026-01-01' })
      .expect(201);
    const cardId = cardRes.body.id;
    if (points > 0) {
      await request(app.getHttpServer())
        .post(`/customers/membership-cards/${cardId}/points`)
        .set(headers())
        .send({ type: 'earn', delta: points, note: 'seed' })
        .expect(201);
    }
    return cardId;
  };

  // ─── EPIC A: customer summary ──────────────────────────────────────
  describe('GET /customers/:id/summary', () => {
    it('returns zeroed purchases/debt and null membership for a fresh customer', async () => {
      const customerId = await createCustomer('Summary Fresh');

      const res = await request(app.getHttpServer())
        .get(`/customers/${customerId}/summary`)
        .set(headers())
        .expect(200);

      expect(res.body).toEqual({
        customerId,
        purchases: { totalSpending: 0, invoiceCount: 0 },
        debt: { totalOutstanding: 0, documentCount: 0 },
        membership: null,
      });
    });

    it('reflects membership points and points used', async () => {
      const customerId = await createCustomer('Summary Member');
      const cardId = await issueCardWithPoints(customerId, 100);
      // Redeem 30 points administratively to populate "points used".
      await request(app.getHttpServer())
        .post(`/customers/membership-cards/${cardId}/points`)
        .set(headers())
        .send({ type: 'redeem', delta: -30, note: 'manual redeem' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/customers/${customerId}/summary`)
        .set(headers())
        .expect(200);

      expect(res.body.membership).toEqual(
        expect.objectContaining({ points: 70, pointsUsed: 30 }),
      );
    });
  });

  // ─── EPIC B: redeem points on a draft invoice ──────────────────────
  describe('POST/DELETE /invoices/:id/redeem-points', () => {
    let itemId: string;
    let locationId: string;
    let sessionId: string;

    beforeAll(async () => {
      const itemRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          code: 'LOY-ITEM',
          name: 'Loyalty Widget',
          unit: 'PCS',
          purchasePrice: 10000,
          sellingPrice: 30000,
        })
        .expect(201);
      itemId = itemRes.body.id;

      const storageRes = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'LOY WH', branchId: seed.branchId })
        .expect(201);

      const locRes = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({
          code: 'LOY-LOC',
          type: 'SHELF',
          name: 'Loyalty Loc',
          storageId: storageRes.body.id,
          branchId: seed.branchId,
        })
        .expect(201);
      locationId = locRes.body.id;

      const sessionRes = await request(app.getHttpServer())
        .post('/pos/sessions/open')
        .set(headers())
        .send({ branchId: seed.branchId, openingCashAmount: 0 })
        .expect(201);
      sessionId = sessionRes.body.id;
    });

    const createDraft = async (customerId: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/invoices')
        .set(headers())
        .send({
          sessionId,
          customerId,
          items: [
            {
              itemId,
              locationId,
              itemCode: 'LOY-ITEM',
              itemName: 'Loyalty Widget',
              unit: 'PCS',
              quantity: 2,
              unitPrice: 30000,
            },
          ],
        })
        .expect(201);
      return res.body.id;
    };

    it('reduces amountDue by points * 500 and records the redemption', async () => {
      const customerId = await createCustomer('Redeem OK');
      await issueCardWithPoints(customerId, 100);
      const invoiceId = await createDraft(customerId);

      const res = await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/redeem-points`)
        .set(headers())
        .send({ points: 30 })
        .expect(201);

      // subtotal 60.000 − 30 points * 500 = 45.000 due.
      expect(res.body.pointsRedeemed).toBe(30);
      expect(Number(res.body.pointsDiscountAmount)).toBe(15000);
      expect(Number(res.body.amountDue)).toBe(45000);
    });

    it('rejects redeeming more points than the balance', async () => {
      const customerId = await createCustomer('Redeem TooMany');
      await issueCardWithPoints(customerId, 100);
      const invoiceId = await createDraft(customerId);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/redeem-points`)
        .set(headers())
        .send({ points: 1000 })
        .expect(400);
    });

    it('rejects redemption when the customer has no card', async () => {
      const customerId = await createCustomer('Redeem NoCard');
      const invoiceId = await createDraft(customerId);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/redeem-points`)
        .set(headers())
        .send({ points: 5 })
        .expect(400);
    });

    it('restores amountDue when redemption is removed', async () => {
      const customerId = await createCustomer('Redeem Remove');
      await issueCardWithPoints(customerId, 100);
      const invoiceId = await createDraft(customerId);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/redeem-points`)
        .set(headers())
        .send({ points: 20 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/invoices/${invoiceId}/redeem-points`)
        .set(headers())
        .expect(200);

      expect(res.body.pointsRedeemed).toBe(0);
      expect(Number(res.body.pointsDiscountAmount)).toBe(0);
      expect(Number(res.body.amountDue)).toBe(60000);
    });
  });
});
