import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
} from './setup/test-app';
import { CoaSeederService } from '../../src/modules/accounting/seeders/coa-seeder.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * Phase 1 manual cash voucher flows (no auto-create): receipt, payment, ledger,
 * cash count variance + multi-tenant isolation. Backend-only (HTTP).
 */
describe('Cash Vouchers Phase 1 (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let revenueAccountId: string; // 511
  let expenseAccountId: string; // 642

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const accountByCode = async (code: string): Promise<string> => {
    const rows = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [seed.organizationId, code],
    );
    return rows[0].id;
  };

  const getBalance = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/cash/accounts/${cashAccountId}`)
      .set(headers())
      .expect(200);
    return Number(res.body.balance);
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // Chart of accounts (incl. TK 711/811 for variance vouchers).
    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);

    // Grant the cash-voucher permissions to the seeded admin role.
    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const cashPerms = [
      'accounting.cash_receipt.create', 'accounting.cash_receipt.read',
      'accounting.cash_receipt.update', 'accounting.cash_receipt.delete',
      'accounting.cash_receipt.post', 'accounting.cash_receipt.reverse',
      'accounting.cash_payment.create', 'accounting.cash_payment.read',
      'accounting.cash_payment.update', 'accounting.cash_payment.delete',
      'accounting.cash_payment.post', 'accounting.cash_payment.reverse',
      'accounting.cash_count.create', 'accounting.cash_count.read',
      'accounting.cash_count.update', 'accounting.cash_count.post',
      'accounting.cash_ledger.read',
    ];
    for (const key of cashPerms) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'accounting') ON CONFLICT DO NOTHING`,
        [key],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, key],
      );
    }

    // Permissions are cached in Redis keyed by (userId, orgId) which persists
    // across runs; clear it so the freshly granted perms take effect.
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

    const cashGlId = await accountByCode('1111');
    revenueAccountId = await accountByCode('511');
    expenseAccountId = await accountByCode('642');

    const accRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quầy E2E', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountId = accRes.body.id;
  }, 120000); // boot connects many Kafka consumers; allow generous startup time

  afterAll(async () => {
    // Bound app.close(): kafkajs consumer teardown can hang against Redpanda and
    // would otherwise trip the hook timeout and report a fake "suite failed".
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('Cash receipt manual flow', () => {
    let receiptId: string;

    it('creates a DRAFT receipt', async () => {
      const res = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-05-21',
          cashAccountId,
          contraAccountId: revenueAccountId,
          totalAmount: 1000000,
          lines: [{ description: 'Thu bán hàng', amount: 1000000 }],
        })
        .expect(201);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.lines).toHaveLength(1);
      receiptId = res.body.id;
    });

    it('posts the receipt → balance increases + DEPOSIT movement + document number', async () => {
      const before = await getBalance();
      const res = await request(app.getHttpServer())
        .post(`/cash-receipts/${receiptId}/post`)
        .set(headers())
        .expect(201);
      expect(res.body.status).toBe('POSTED');
      expect(res.body.documentNumber).toMatch(/^PT/);
      expect(res.body.cashMovementId).toBeTruthy();
      expect(res.body.journalEntryId).toBeTruthy();
      expect(await getBalance()).toBe(before + 1000000);
    });

    it('rejects editing a POSTED receipt', async () => {
      await request(app.getHttpServer())
        .patch(`/cash-receipts/${receiptId}`)
        .set(headers())
        .send({ reason: 'nope' })
        .expect(400);
    });

    it('reflects the receipt in the cash ledger', async () => {
      const res = await request(app.getHttpServer())
        .get('/cash-ledger')
        .query({ cashAccountId })
        .set(headers())
        .expect(200);
      expect(Number(res.body.closingBalance)).toBe(1000000);
      const row = res.body.rows.find((r: any) => r.debit === 1000000);
      expect(row).toBeDefined();
      expect(row.voucherNumber).toMatch(/^PT/);
      expect(row.kind).toBe('PT');
    });

    it('reverses the receipt → original REVERSED, balance restored', async () => {
      const before = await getBalance();
      const res = await request(app.getHttpServer())
        .post(`/cash-receipts/${receiptId}/reverse`)
        .set(headers())
        .send({ reason: 'Khách trả lại' })
        .expect(201);
      expect(res.body.original.status).toBe('REVERSED');
      expect(res.body.reversal.status).toBe('POSTED');
      expect(res.body.reversal.referenceType).toBe('REVERSAL');
      expect(Number(res.body.reversal.totalAmount)).toBe(1000000);
      expect(await getBalance()).toBe(before - 1000000);
    });
  });

  describe('Cash payment manual flow', () => {
    beforeAll(async () => {
      // Top up the register so payments can be posted.
      const r = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-05-21',
          cashAccountId,
          contraAccountId: revenueAccountId,
          totalAmount: 2000000,
          lines: [{ description: 'Nạp quỹ', amount: 2000000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/cash-receipts/${r.body.id}/post`)
        .set(headers())
        .expect(201);
    });

    it('creates and posts a payment → balance decreases + WITHDRAWAL', async () => {
      const before = await getBalance();
      const create = await request(app.getHttpServer())
        .post('/cash-payments')
        .set(headers())
        .send({
          voucherDate: '2026-05-21',
          cashAccountId,
          contraAccountId: expenseAccountId,
          totalAmount: 500000,
          lines: [{ description: 'Chi văn phòng phẩm', amount: 500000 }],
        })
        .expect(201);
      const posted = await request(app.getHttpServer())
        .post(`/cash-payments/${create.body.id}/post`)
        .set(headers())
        .expect(201);
      expect(posted.body.status).toBe('POSTED');
      expect(posted.body.documentNumber).toMatch(/^PC/);
      expect(await getBalance()).toBe(before - 500000);
    });

    it('rejects posting a payment with insufficient balance (400)', async () => {
      const create = await request(app.getHttpServer())
        .post('/cash-payments')
        .set(headers())
        .send({
          voucherDate: '2026-05-21',
          cashAccountId,
          contraAccountId: expenseAccountId,
          totalAmount: 999999999,
          lines: [{ description: 'Chi quá tay', amount: 999999999 }],
        })
        .expect(201);
      const before = await getBalance();
      await request(app.getHttpServer())
        .post(`/cash-payments/${create.body.id}/post`)
        .set(headers())
        .expect(400);
      expect(await getBalance()).toBe(before); // balance unchanged
    });
  });

  describe('Cash count variance', () => {
    it('variance > 0 creates an OTHER_INCOME cash receipt', async () => {
      const balance = await getBalance();
      const create = await request(app.getHttpServer())
        .post('/cash-counts')
        .set(headers())
        .send({
          cashAccountId,
          countedAt: '2026-05-21T10:00:00Z',
          actualAmount: balance + 300000,
        })
        .expect(201);
      expect(create.body.expectedAmount).toBeNull();
      expect(Number(create.body.currentBalance)).toBe(balance);

      const post = await request(app.getHttpServer())
        .post(`/cash-counts/${create.body.id}/post`)
        .set(headers())
        .expect(201);
      expect(Number(post.body.variance)).toBe(300000);
      expect(post.body.varianceVoucher.kind).toBe('CASH_RECEIPT');
      expect(await getBalance()).toBe(balance + 300000);
    });

    it('variance < 0 creates an OTHER cash payment', async () => {
      const balance = await getBalance();
      const create = await request(app.getHttpServer())
        .post('/cash-counts')
        .set(headers())
        .send({
          cashAccountId,
          countedAt: '2026-05-21T11:00:00Z',
          actualAmount: balance - 100000,
        })
        .expect(201);
      const post = await request(app.getHttpServer())
        .post(`/cash-counts/${create.body.id}/post`)
        .set(headers())
        .expect(201);
      expect(Number(post.body.variance)).toBe(-100000);
      expect(post.body.varianceVoucher.kind).toBe('CASH_PAYMENT');
      expect(await getBalance()).toBe(balance - 100000);
    });

    it('variance = 0 posts without creating a voucher', async () => {
      const balance = await getBalance();
      const create = await request(app.getHttpServer())
        .post('/cash-counts')
        .set(headers())
        .send({
          cashAccountId,
          countedAt: '2026-05-21T12:00:00Z',
          actualAmount: balance,
        })
        .expect(201);
      const post = await request(app.getHttpServer())
        .post(`/cash-counts/${create.body.id}/post`)
        .set(headers())
        .expect(201);
      expect(Number(post.body.variance)).toBe(0);
      expect(post.body.varianceVoucher).toBeNull();
      expect(post.body.status).toBe('POSTED');
    });
  });

  describe('Multi-tenant isolation', () => {
    it('does not list vouchers from another organization', async () => {
      const otherOrg = 'e0000000-0000-4000-8000-000000000099';
      await ds.query(
        `INSERT INTO cash_receipts
           (id, organization_id, voucher_date, status, purpose, cash_account_id,
            contra_account_id, total_amount, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '2026-05-21', 'DRAFT', 'OTHER', $2, $3, 100, $4, NOW(), NOW())`,
        [otherOrg, cashAccountId, revenueAccountId, seed.userId],
      );

      const res = await request(app.getHttpServer())
        .get('/cash-receipts')
        .query({ pageSize: 200 })
        .set(headers())
        .expect(200);
      const orgs = new Set(res.body.data.map((v: any) => v.organizationId));
      expect(orgs.has(otherOrg)).toBe(false);
    });
  });
});
