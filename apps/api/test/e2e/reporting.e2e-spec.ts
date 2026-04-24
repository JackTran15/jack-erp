import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Reporting (E2E)', () => {
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

  // ─── Dashboard ────────────────────────────────────────────────────

  describe('GET /reports/dashboard', () => {
    it('should return dashboard data for assigned branch', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/dashboard')
        .set(headers())
        .query({
          branchId: seed.branchId,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .expect(200);

      expect(res.body).toBeDefined();
      expect(typeof res.body).toBe('object');
    });
  });

  // ─── Sales summary ───────────────────────────────────────────────

  describe('GET /reports/sales-summary', () => {
    it('should return sales summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/sales-summary')
        .set(headers())
        .query({
          branchId: seed.branchId,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  // ─── Inventory valuation ──────────────────────────────────────────

  describe('GET /reports/inventory-valuation', () => {
    it('should return inventory valuation', async () => {
      await request(app.getHttpServer())
        .get('/reports/inventory-valuation')
        .set(headers())
        .query({ branchId: seed.branchId })
        .expect(200);
    });
  });

  // ─── Receivables aging ────────────────────────────────────────────

  describe('GET /reports/receivables-aging', () => {
    it('should return receivables aging', async () => {
      await request(app.getHttpServer())
        .get('/reports/receivables-aging')
        .set(headers())
        .query({ branchId: seed.branchId })
        .expect(200);
    });
  });

  // ─── Payables aging ───────────────────────────────────────────────

  describe('GET /reports/payables-aging', () => {
    it('should return payables aging', async () => {
      await request(app.getHttpServer())
        .get('/reports/payables-aging')
        .set(headers())
        .query({ branchId: seed.branchId })
        .expect(200);
    });
  });

  // ─── Cash reconciliation ──────────────────────────────────────────

  describe('GET /reports/cash-reconciliation', () => {
    it('should return cash reconciliation', async () => {
      await request(app.getHttpServer())
        .get('/reports/cash-reconciliation')
        .set(headers())
        .query({ branchId: seed.branchId })
        .expect(200);
    });
  });

  // ─── Branch scope enforcement ─────────────────────────────────────

  describe('Branch scope enforcement', () => {
    it('should restrict dashboard to assigned branch', async () => {
      const fakeBranch = 'b9999999-9999-4999-9999-999999999999';
      await request(app.getHttpServer())
        .get('/reports/dashboard')
        .set({
          ...headers(),
          'X-Branch-Id': fakeBranch,
        })
        .query({ branchId: fakeBranch })
        .expect(403);
    });
  });

  // ─── Consolidated report permission ───────────────────────────────

  describe('Consolidated report requires permission', () => {
    it('should allow consolidated access with proper permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/dashboard')
        .set(headers())
        .query({
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  // ─── Async report ─────────────────────────────────────────────────

  describe('Async report', () => {
    it('should submit an async report and return job id', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/async')
        .set(headers())
        .send({
          type: 'SALES_SUMMARY',
          branchId: seed.branchId,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .expect(201);

      expect(res.body).toHaveProperty('jobId');

      if (res.body.jobId) {
        const statusRes = await request(app.getHttpServer())
          .get(`/reports/async/${res.body.jobId}`)
          .set(headers())
          .expect(200);

        expect(statusRes.body).toHaveProperty('status');
      }
    });
  });
});
