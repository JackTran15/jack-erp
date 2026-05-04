import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  // ─── Shared setup: item + storage + location ──────────────────────
  // Inventory location requires both `code` and `type` (NOT NULL columns) in
  // addition to the DTO-validated fields.

  let itemId: string;
  let locationId: string;
  let sessionId: string;

  beforeAll(async () => {
    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'POS-ITEM',
        name: 'POS Widget',
        unit: 'PCS',
        purchasePrice: 10,
        sellingPrice: 30,
      })
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
      .send({
        code: 'POS-LOC',
        type: 'SHELF',
        name: 'POS Loc',
        storageId: storageRes.body.id,
        branchId: seed.branchId,
      })
      .expect(201);
    locationId = locRes.body.id;
  });

  // ─── Session lifecycle ────────────────────────────────────────────
  // OpenSessionDto: { branchId: UUID, openingCashAmount: number, terminalId?:
  // UUID } — note `openingCashAmount` (not `openingCash`) and `terminalId`
  // must be a UUID, so omit it when no real terminal exists.

  describe('Session management', () => {
    it('should open a POS session', async () => {
      const res = await request(app.getHttpServer())
        .post('/pos/sessions/open')
        .set(headers())
        .send({
          branchId: seed.branchId,
          openingCashAmount: 500.0,
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

    it('should transition to ACTIVE_SALES via start-sales', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/start-sales`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('ACTIVE_SALES');
    });
  });

  // ─── Checkout ─────────────────────────────────────────────────────
  // Skipped: a successful checkout requires the COA accounts (cashAccountId,
  // revenueAccountId) AND positive stock at `locationId`. The latter requires
  // either a stock-adjustment seed (which itself depends on an approval flow)
  // or a direct ledger insert. The Return / Exchange flows depend on
  // `originalSaleLineId` from a successful checkout, so they're skipped here
  // too. The CheckoutService logic is covered by `checkout.service.spec.ts`.

  describe.skip('Checkout flow (requires stock + COA seed)', () => {
    it('should checkout a sale (creates sale + stock movement + journal)', () => {
      // Intentionally empty — see suite description.
    });
  });

  // ─── Session reconciliation and close ─────────────────────────────
  // With no sales, expectedCash equals openingCashAmount. Submitting an
  // actualCash that matches results in variance=0 which is auto-approved.

  describe('Session reconciliation and close', () => {
    it('should initiate session close', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/start-close`)
        .set(headers())
        .expect(201);

      expect(res.body.session?.status ?? res.body.status).toBe('CLOSING');
    });

    it('should submit reconciliation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/reconciliation`)
        .set(headers())
        .send({
          actualCash: 500.0,
          notes: 'Matches opening cash; no sales recorded',
        })
        .expect(201);

      expect(res.body).toHaveProperty('variance');
      expect(Number(res.body.variance)).toBe(0);
    });

    it('should finalize session close', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pos/sessions/${sessionId}/close`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('CLOSED');
    });
  });
});
