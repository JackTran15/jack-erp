import { randomUUID } from 'crypto';
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
import { DefaultAccountSeederService } from '../../src/modules/accounting/seeders/default-account.seeder';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { StringOperator } from '../../src/common/filters/filter.dto';

/**
 * The party column and the person column never borrow from each other, on all
 * four read paths (ADR-02).
 *
 * Four SQL sources used to fold `partner_name_snapshot` and
 * `payer_name`/`payee_name` into one column with a COALESCE — and did it in
 * three DIFFERENT orders, so the same heading meant different things on
 * different screens. Four near-identical cases in one table is deliberate: the
 * real risk is fixing one source and forgetting a twin, and a per-screen spec
 * would let that pass.
 *
 * Every case filters with an IMPOSSIBLE value — a name held only by the other
 * column — and demands zero rows. On data where both fields carry the same text
 * (which is what a real fixture usually looks like) a broken filter still
 * returns the row, so only the empty result proves anything. Each case pairs
 * that with a positive control, because zero rows also happens when the fixture
 * never landed.
 */
describe('Voucher party/person columns (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let depositAccountId: string;

  // Nonce-suffixed so a re-run cannot match the previous run's rows.
  const nonce = randomUUID().slice(0, 8);
  const PARTY_ONLY = `PARTYONLY${nonce}`;
  const PERSON_ONLY = `PERSONONLY${nonce}`;

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

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);
    await app
      .get(DefaultAccountSeederService)
      .seedForOrganization(seed.organizationId, seed.userId);

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const perms = [
      'accounting.cash_receipt.create', 'accounting.cash_receipt.read',
      'accounting.cash_payment.create', 'accounting.cash_payment.read',
      'accounting.bank_receipt.create', 'accounting.bank_receipt.read',
      'accounting.bank_payment.create', 'accounting.bank_payment.read',
      'accounting.cash_ledger.read',
      'accounting.deposit_ledger.read',
      'accounting.deposit_account.read',
    ];
    for (const key of perms) {
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
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

    const cashGlId = await accountByCode('1111');
    const accRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quầy E2E', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountId = accRes.body.id;

    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    const coaBankId = await accountByCode('1121');
    const bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );
    depositAccountId = randomUUID();
    await ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'Deposit E2E', 'DP1', 'ACC-DP1', 'ERP Test', $4,
               'BANK_ACCOUNT', $5, 0, '2026-01-01', 100000000, false, true,
               'ACTIVE', $6, NOW(), NOW())`,
      [depositAccountId, seed.organizationId, seed.branchId, bankId, coaBankId, seed.userId],
    );

    // One voucher of each shape per money type. Created through the API rather
    // than by INSERT so the movement rows the two ledgers read from exist too.
    const post = async (path: string, body: Record<string, unknown>) =>
      request(app.getHttpServer()).post(path).set(headers()).send(body).expect(201);

    await post('/cash-receipts', {
      voucherDate: '2026-06-30',
      cashAccountId,
      totalAmount: 100000,
      lines: [{ description: 'Thu khác', amount: 100000 }],
      partnerType: 'OTHER',
      partnerName: PARTY_ONLY,
    });
    await post('/cash-payments', {
      voucherDate: '2026-06-30',
      cashAccountId,
      totalAmount: 50000,
      lines: [{ description: 'Chi khác', amount: 50000 }],
      payeeName: PERSON_ONLY,
    });
    await post('/bank-receipts', {
      docDate: '2026-06-30',
      depositAccountId,
      totalAmount: 100000,
      lines: [{ description: 'Thu khác', amount: 100000 }],
      partnerType: 'OTHER',
      partnerName: PARTY_ONLY,
    });
    await post('/bank-payments', {
      docDate: '2026-06-30',
      depositAccountId,
      totalAmount: 50000,
      lines: [{ description: 'Chi khác', amount: 50000 }],
      payeeName: PERSON_ONLY,
    });
  }, 300_000);

  afterAll(async () => {
    // Bound app.close(): kafkajs teardown can hang and report a fake failure.
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  type Endpoint = {
    label: string;
    path: string;
    /** Filters the whole ledger/list down to this feature's fixtures. */
    scope: Record<string, unknown>;
    /** Ledgers answer `{ rows }`, the voucher lists `{ data }`. */
    count: (body: Record<string, unknown>) => number;
  };

  const endpoints = (): Endpoint[] => [
    {
      label: 'cash voucher list',
      path: '/v2/cash-vouchers/search',
      scope: { cashAccountId: () => cashAccountId },
      count: (body) => (body.data as unknown[]).length,
    },
    {
      label: 'deposit voucher list',
      path: '/v2/deposit-vouchers/search',
      scope: { depositAccountId: () => depositAccountId },
      count: (body) => (body.data as unknown[]).length,
    },
    {
      label: 'cash ledger',
      path: '/v2/cash-ledger/search',
      scope: { cashAccountId: () => cashAccountId },
      count: (body) => (body.rows as unknown[]).length,
    },
    {
      label: 'deposit ledger',
      path: '/v2/deposit-ledger/search',
      scope: { depositAccountId: () => depositAccountId },
      count: (body) => (body.rows as unknown[]).length,
    },
  ];

  describe.each(endpoints())('$label', (ep) => {
    /** Resolves the lazily-captured account id and adds one column filter. */
    const search = async (filter: Record<string, unknown>) => {
      const scope = Object.fromEntries(
        Object.entries(ep.scope).map(([k, v]) => [
          k,
          typeof v === 'function' ? (v as () => string)() : v,
        ]),
      );
      const res = await request(app.getHttpServer())
        .post(ep.path)
        .set(headers())
        .send({ ...scope, ...filter })
        .expect(201);
      return ep.count(res.body);
    };

    // The operator is the wire value ('*'), not the enum member name — sending
    // the name gets a 400 from the global ValidationPipe, not a wrong result.
    const contains = (value: string) => ({
      operator: StringOperator.CONTAINS,
      value,
    });

    it('finds the fixtures through their own columns (positive control)', async () => {
      // Without this, the two zero-row assertions below would also pass on an
      // endpoint that silently returns nothing at all.
      expect(await search({ counterparty: contains(PARTY_ONLY) })).toBeGreaterThan(0);
      expect(await search({ personName: contains(PERSON_ONLY) })).toBeGreaterThan(0);
    });

    it('never matches a person name through the party filter', async () => {
      expect(await search({ counterparty: contains(PERSON_ONLY) })).toBe(0);
    });

    it('never matches a party name through the person filter', async () => {
      expect(await search({ personName: contains(PARTY_ONLY) })).toBe(0);
    });
  });
});
