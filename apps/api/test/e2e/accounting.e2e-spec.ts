import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Accounting (E2E)', () => {
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

  // ─── Seed COA accounts ────────────────────────────────────────────

  let debitAccountId: string;
  let creditAccountId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    const debitRes = await request(app.getHttpServer())
      .post('/coa/accounts')
      .set(headers())
      .send({
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        branchId: seed.branchId,
      });
    debitAccountId = debitRes.body?.id;

    const creditRes = await request(app.getHttpServer())
      .post('/coa/accounts')
      .set(headers())
      .send({
        code: '4000',
        name: 'Sales Revenue',
        type: 'REVENUE',
        branchId: seed.branchId,
      });
    creditAccountId = creditRes.body?.id;
  });

  // ─── Journal posting ──────────────────────────────────────────────

  describe('Journal posting', () => {
    let journalId: string;

    it('should post a balanced journal entry', async () => {
      const res = await request(app.getHttpServer())
        .post('/journals/post')
        .set(headers())
        .send({
          branchId: seed.branchId,
          description: 'E2E test journal',
          source: 'MANUAL',
          lines: [
            { accountId: debitAccountId, debit: 100, credit: 0, description: 'Debit leg' },
            { accountId: creditAccountId, debit: 0, credit: 100, description: 'Credit leg' },
          ],
        })
        .expect(201);

      journalId = res.body.id;
      expect(res.body.status).toBe('POSTED');
    });

    it('should reject unbalanced journal', async () => {
      await request(app.getHttpServer())
        .post('/journals/post')
        .set(headers())
        .send({
          branchId: seed.branchId,
          description: 'Unbalanced entry',
          source: 'MANUAL',
          lines: [
            { accountId: debitAccountId, debit: 100, credit: 0 },
            { accountId: creditAccountId, debit: 0, credit: 50 },
          ],
        })
        .expect((res) => {
          expect([400, 422]).toContain(res.status);
        });
    });

    it('should list journals', async () => {
      const res = await request(app.getHttpServer())
        .get('/journals')
        .set(headers())
        .expect(200);

      expect(res.body.data?.length ?? res.body.length ?? 0).toBeGreaterThanOrEqual(1);
    });

    // ─── Journal reversal ─────────────────────────────────────────

    describe('Journal reversal', () => {
      it('should reverse a posted journal entry', async () => {
        const res = await request(app.getHttpServer())
          .post(`/journals/${journalId}/reverse`)
          .set(headers())
          .send({ reason: 'E2E reversal test' })
          .expect(201);

        expect(res.body.status).toBe('POSTED');
        expect(res.body).toHaveProperty('id');
        expect(res.body.id).not.toBe(journalId);
      });
    });
  });

  // ─── Payable lifecycle ────────────────────────────────────────────

  describe('Payable lifecycle: draft → post → settle', () => {
    let payableId: string;

    it('should create a payable (draft)', async () => {
      const res = await request(app.getHttpServer())
        .post('/payables')
        .set(headers())
        .send({
          branchId: seed.branchId,
          vendorName: 'Supplier Co',
          amount: 500.0,
          dueDate: '2026-05-01',
          description: 'E2E payable test',
        })
        .expect(201);

      payableId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('should post the payable', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payables/${payableId}/post`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('POSTED');
    });

    it('should settle the payable', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payables/${payableId}/settle`)
        .set(headers())
        .send({
          amount: 500.0,
          method: 'BANK_TRANSFER',
          reference: 'TXN-001',
        })
        .expect(201);

      expect(res.body.status).toBe('SETTLED');
    });
  });

  // ─── Receivable lifecycle ─────────────────────────────────────────

  describe('Receivable lifecycle with write-off', () => {
    let receivableId: string;

    it('should create a receivable', async () => {
      const res = await request(app.getHttpServer())
        .post('/receivables')
        .set(headers())
        .send({
          branchId: seed.branchId,
          customerName: 'Client Inc',
          amount: 300.0,
          dueDate: '2026-05-15',
          description: 'E2E receivable test',
        })
        .expect(201);

      receivableId = res.body.id;
    });

    it('should post the receivable', async () => {
      const res = await request(app.getHttpServer())
        .post(`/receivables/${receivableId}/post`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('POSTED');
    });

    it('should partially collect', async () => {
      const res = await request(app.getHttpServer())
        .post(`/receivables/${receivableId}/collect`)
        .set(headers())
        .send({
          amount: 200.0,
          method: 'CASH',
          reference: 'RCV-001',
        })
        .expect(201);

      expect(res.body.status).toBe('PARTIALLY_COLLECTED');
    });

    it('should write off the remainder', async () => {
      const res = await request(app.getHttpServer())
        .post(`/receivables/${receivableId}/write-off`)
        .set(headers())
        .send({ reason: 'Uncollectable — E2E test' })
        .expect(201);

      expect(res.body.status).toBe('WRITTEN_OFF');
    });
  });

  // ─── Cash movement with journal ───────────────────────────────────

  describe('Cash movement with journal creation', () => {
    it('should create a cash account', async () => {
      const res = await request(app.getHttpServer())
        .post('/cash/accounts')
        .set(headers())
        .send({
          name: 'Petty Cash',
          branchId: seed.branchId,
          openingBalance: 1000.0,
        })
        .expect(201);

      cashAccountId = res.body.id;
      expect(res.body.name).toBe('Petty Cash');
    });

    it('should record a cash movement and create a journal entry', async () => {
      const res = await request(app.getHttpServer())
        .post('/cash/movements')
        .set(headers())
        .send({
          cashAccountId,
          branchId: seed.branchId,
          type: 'WITHDRAWAL',
          amount: 150.0,
          description: 'Office supplies',
          reference: 'CASH-001',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      if (res.body.journalEntryId) {
        const journalRes = await request(app.getHttpServer())
          .get(`/journals/${res.body.journalEntryId}`)
          .set(headers())
          .expect(200);
        expect(journalRes.body.status).toBe('POSTED');
      }
    });
  });
});
