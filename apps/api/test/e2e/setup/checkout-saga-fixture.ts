import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createTestApp, resetDatabase, seedBaseData, authHeader, SeedResult } from './test-app';
import { CoaSeederService } from '../../../src/modules/accounting/seeders/coa-seeder.service';
import { DefaultAccountSeederService } from '../../../src/modules/accounting/seeders/default-account.seeder';

/**
 * Deliberately named without the `.e2e-spec.ts` suffix jest's `testRegex`
 * matches — `describe`/`it` are global functions, so importing a file that
 * matches the pattern would register its top-level suites a second time in
 * whatever file imports it. Pure helpers live here so T-02-08/T-02-09 (and
 * whatever comes after) can import them without side effects.
 */

/**
 * Counts rows across every table the checkout saga can write, so a dry-run
 * (or a deliberately failed transactional run) can be proven to have left the
 * database exactly as it found it — the epic's "Success signal" (00-intent.md).
 */
export async function countBusinessRows(
  ds: DataSource,
): Promise<Record<string, number>> {
  const tables = [
    'invoices',
    'invoice_payments',
    'invoice_debts',
    'stock_ledger_entries',
    'journal_entries',
    'cash_movements',
    'outbox_messages',
    'checkout_saga',
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await ds.query(`SELECT count(*)::int AS c FROM "${table}"`);
    counts[table] = rows[0].c;
  }
  return counts;
}

export interface CheckoutSagaFixture {
  app: INestApplication;
  ds: DataSource;
  seed: SeedResult;
  itemId: string;
  itemId2: string;
  itemId3: string;
  locationId: string;
  customerId: string;
  headers: () => Record<string, string>;
}

/**
 * Shared fixture for the checkout-saga e2e suite: org/branch/user (via
 * seedBaseData), full COA + default REVENUE/RECEIVABLE roles, a branch cash
 * fund, 3 stocked items with one location, and one customer. Reused from
 * UOW-02 onward — do not re-seed this in later spec files.
 */
export async function buildCheckoutSagaFixture(): Promise<CheckoutSagaFixture> {
  const app = await createTestApp();
  await resetDatabase(app);
  const seed = await seedBaseData(app);
  const ds = app.get(DataSource);

  await app
    .get(CoaSeederService)
    .seedForOrganization(seed.organizationId, seed.userId);
  await app
    .get(DefaultAccountSeederService)
    .seedForOrganization(seed.organizationId, seed.userId);

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const cashGl = await ds.query(
    `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1111' LIMIT 1`,
    [seed.organizationId],
  );
  await request(app.getHttpServer())
    .post('/cash/accounts')
    .set(headers())
    .send({
      name: 'Quỹ E2E Checkout',
      type: 'REGISTER',
      accountId: cashGl[0].id,
      balance: 0,
    })
    .expect(201);

  // The cash fund above is the *till* (cash_accounts); AccountResolverService
  // separately needs a payment_accounts config row mapping the `cash` method
  // to a COA account before it will resolve a payment line at all.
  await ds.query(
    `INSERT INTO payment_accounts
       (id, organization_id, branch_id, payment_method, account_id, is_active, sort_order, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, NULL, 'cash', $2, true, 0, $3, NOW(), NOW())`,
    [seed.organizationId, cashGl[0].id, seed.userId],
  );

  const storageRes = await request(app.getHttpServer())
    .post('/inventory/storages')
    .set(headers())
    .send({ name: 'Checkout WH', branchId: seed.branchId })
    .expect(201);

  const locRes = await request(app.getHttpServer())
    .post('/inventory/locations')
    .set(headers())
    .send({
      code: 'CKO-LOC',
      type: 'SHELF',
      name: 'Checkout Loc',
      storageId: storageRes.body.id,
      branchId: seed.branchId,
    })
    .expect(201);
  const locationId = locRes.body.id;

  const createItem = async (code: string, sellingPrice: number) => {
    const res = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code,
        name: `Item ${code}`,
        unit: 'PCS',
        purchasePrice: Math.round(sellingPrice * 0.6),
        sellingPrice,
      })
      .expect(201);
    await ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, $5, NOW(), NOW())`,
      [seed.organizationId, seed.branchId, res.body.id, locationId, seed.userId],
    );
    return res.body.id as string;
  };
  const itemId = await createItem('CKO-ITEM-1', 100000);
  const itemId2 = await createItem('CKO-ITEM-2', 200000);
  const itemId3 = await createItem('CKO-ITEM-3', 685000);

  const customerRes = await request(app.getHttpServer())
    .post('/customers')
    .set(headers())
    .send({ name: 'Checkout Test Customer' })
    .expect(201);
  const customerId = customerRes.body.id;

  return {
    app,
    ds,
    seed,
    itemId,
    itemId2,
    itemId3,
    locationId,
    customerId,
    headers,
  };
}

export interface ScopedTestUser {
  userId: string;
  accessToken: string;
  headers: () => Record<string, string>;
}

/**
 * Creates a fresh user + role holding **exactly** `permissionKeys` — no more,
 * no less — in the given org/branch. `seedBaseData` only ever provisions one
 * admin user carrying every permission on this app's list, which cannot prove
 * a permission *guard* actually blocks: a suite asserting 403 needs a token
 * that genuinely lacks the key, and one asserting 200 off a narrow key (e.g.
 * `pos.promotion.evaluate`) needs a token that doesn't also carry
 * `promotion.read` masking the check (T-01-06, ADR-05).
 *
 * Fresh `userId` per call, so there is nothing to invalidate in the
 * `RbacService` Redis cache (unlike `seedPromotionFixtures`, which grants
 * onto the already-logged-in shared admin role).
 */
export async function createUserWithPermissions(
  app: INestApplication,
  base: { organizationId: string; branchId: string },
  permissionKeys: string[],
): Promise<ScopedTestUser> {
  const ds = app.get(DataSource);
  const userId = randomUUID();
  const roleId = randomUUID();
  const email = `e2e-scoped-${userId}@test.com`;
  const passwordHash = await bcrypt.hash('password123', 10);

  await ds.query(
    `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'E2E', 'Scoped', true, NOW(), NOW())`,
    [userId, base.organizationId, email, passwordHash],
  );
  await ds.query(
    `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'E2E scoped-permission role', NOW(), NOW())`,
    [roleId, base.organizationId, `e2e-scoped-${roleId}`],
  );
  await ds.query(
    `INSERT INTO user_roles (id, user_id, role_id, organization_id)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
    [userId, roleId, base.organizationId],
  );
  await ds.query(
    `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
    [userId, base.branchId, base.organizationId],
  );
  for (const key of permissionKeys) {
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), $1, $1, $2)
       ON CONFLICT DO NOTHING`,
      [key, key.split('.')[0]],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
       ON CONFLICT DO NOTHING`,
      [roleId, key],
    );
  }

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123', organizationId: base.organizationId })
    .expect(200);
  const accessToken = login.body.accessToken as string;

  return {
    userId,
    accessToken,
    headers: () => ({
      Authorization: authHeader(accessToken),
      'X-Branch-Id': base.branchId,
    }),
  };
}
